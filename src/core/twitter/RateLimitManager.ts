import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { Logger, LogContext } from '../../types/logger.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { Environment } from '../../config/environment.js';
import { RateLimitConfig } from '../../config/twitter.js';

interface RateLimitState {
  lastRequestTime: number;
  consecutiveFailures: number;
  rateLimitReset: Date | null;
  currentBackoff: number;
}

@injectable()
export class RateLimitManager {
  private state: RateLimitState = {
    lastRequestTime: 0,
    consecutiveFailures: 0,
    rateLimitReset: null,
    currentBackoff: 1000 // Will be updated in resetState()
  };
  
  private config: RateLimitConfig = {
    requestsPerSecond: 1,
    minRate: 0.1,
    safetyFactor: 0.75,
    topicDelay: 120000,
    backoff: { initialDelay: 5000, maxDelay: 300000, multiplier: 4 },
    cooldown: { duration: 30 * 60 * 1000, retryAfter: 30000 }
  };
  
  private queue: (() => Promise<any>)[] = [];
  private processing: boolean = false;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.Environment) private environment: Environment
  ) {
    this.logger.setComponent('RateLimitManager');
    this.initializeConfig();
    this.resetState();
  }

  private initializeConfig(): void {
    // Load config from environment variables with defaults
    this.config = {
      requestsPerSecond: Number(process.env.TWITTER_RATE_LIMIT) || 1,
      minRate: Number(process.env.TWITTER_MIN_RATE) || 0.1,
      safetyFactor: 0.75,
      topicDelay: Number(process.env.TWITTER_TOPIC_DELAY_MS) || 120000,
      backoff: {
        initialDelay: 1000,
        maxDelay: 60000,
        multiplier: 3
      },
      cooldown: {
        duration: 15 * 60 * 1000, // 15 minutes
        retryAfter: 15000
      }
    };

    this.logger.info('Initialized rate limit configuration', {
      requestsPerSecond: this.config.requestsPerSecond,
      minRate: this.config.minRate,
      topicDelay: this.config.topicDelay
    });
  }

  private resetState(): void {
    this.state = {
      lastRequestTime: 0,
      consecutiveFailures: 0,
      rateLimitReset: null,
      currentBackoff: this.config.backoff.initialDelay
    };
  }

  async executeWithRateLimit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeTask(task);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (await this.shouldDelay()) {
        await this.applyDelay();
        continue;
      }

      const task = this.queue.shift();
      if (task) {
        try {
          await task();
          this.handleSuccess();
        } catch (error) {
          this.handleError(error);
        }
      }
    }

    this.processing = false;
  }

  private async shouldDelay(): Promise<boolean> {
    const now = Date.now();

    // Check rate limit reset time
    if (this.state.rateLimitReset && now < this.state.rateLimitReset.getTime()) {
      return true;
    }

    // Check minimum interval between requests
    const minInterval = (1000 / this.config.requestsPerSecond) / this.config.safetyFactor;
    const timeSinceLastRequest = now - this.state.lastRequestTime;
    return timeSinceLastRequest < minInterval;
  }

  private async applyDelay(): Promise<void> {
    const now = Date.now();
    let delay = 0;

    if (this.state.rateLimitReset && now < this.state.rateLimitReset.getTime()) {
      delay = this.state.rateLimitReset.getTime() - now;
    } else {
      const minInterval = (1000 / this.config.requestsPerSecond) / this.config.safetyFactor;
      const timeSinceLastRequest = now - this.state.lastRequestTime;
      delay = Math.max(0, minInterval - timeSinceLastRequest);
    }

    // Add progressive jitter based on queue size
    const baseJitter = 500;
    const queueFactor = Math.min(5, 1 + (this.queue.length * 0.1)); // Scale jitter up to 5x based on queue size
    const jitter = Math.random() * baseJitter * queueFactor;
    
    this.logger.debug('Applying rate limit delay', {
      baseDelay: delay, jitter, queueSize: this.queue.length, queueFactor
    });
    await new Promise(resolve => setTimeout(resolve, delay + jitter));
  }

  private async executeTask<T>(task: () => Promise<T>): Promise<T> {
    this.state.lastRequestTime = Date.now();
    return task();
  }

  private handleSuccess(): void {
    this.state.consecutiveFailures = 0;
    this.state.currentBackoff = this.config.backoff.initialDelay;
    this.metrics.increment('ratelimit.success');
  }

  private handleError(error: any): void {
    this.metrics.increment('ratelimit.error');
    
    if (this.isRateLimitError(error)) {
      this.handleRateLimit();
    } else {
      this.handleGenericError();
    }
  }

  private handleRateLimit(): void {
    this.metrics.increment('ratelimit.exceeded');
    this.state.rateLimitReset = new Date(Date.now() + this.config.cooldown.duration);
    const context: LogContext = {
      component: 'RateLimitManager',
      cooldownUntil: this.state.rateLimitReset.toISOString(),
      queueSize: this.queue.length,
      consecutiveFailures: this.state.consecutiveFailures,
      currentBackoff: this.state.currentBackoff
    };
    this.logger.warn('Rate limit exceeded, cooling down', undefined, context);
  }

  private handleGenericError(): void {
    this.state.consecutiveFailures++;
    this.state.currentBackoff = Math.min(
      this.state.currentBackoff * this.config.backoff.multiplier,
      this.config.backoff.maxDelay
    );
  }

  private isRateLimitError(error: any): boolean {
    return error?.status === 429 || 
           error?.code === 429 || 
           error?.message?.includes('TOO_MANY_REQUESTS') ||
           error?.message?.includes('rate limit');
  }

  async getTopicDelay(): Promise<number> {
    return this.config.topicDelay;
  }

  getCurrentRate(): number {
    return this.config.requestsPerSecond * this.config.safetyFactor;
  }

  getMinRate(): number {
    return this.config.minRate;
  }
}