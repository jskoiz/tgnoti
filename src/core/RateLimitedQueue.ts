import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger, LogContext, LogAggregator, LogLevel } from '../types/logger.js';
import { MetricsManager } from '../types/metrics.js';
import { LoggingConfig } from '../config/loggingConfig.js';

type QueueTask<T> = () => Promise<T>;

interface QueueError extends Error {
  code?: string | number;
  details?: Record<string, unknown>;
}

@injectable()
export class RateLimitedQueue {
  private queue: QueueTask<any>[] = [];
  private processing: boolean = false;
  private initialized: boolean = false;
  private requestsPerSecond: number = 1;
  private lastProcessTime: number;
  private lastHeartbeat: number;
  private lastQueueSize: number = 0;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly TASK_TIMEOUT = 120000; // 120 second task timeout
  private consecutiveErrors: number = 0;
  private readonly MAX_CONSECUTIVE_ERRORS = 5;
  private readonly ERROR_BACKOFF_TIME = 10000; // 10 seconds
  
  private rateLimitAggregator: LogAggregator = {
    count: 0,
    lastLog: 0,
    window: 30000 // 30 second window for rate limit aggregation
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.LoggingConfig) private loggingConfig: LoggingConfig
  ) {
    this.queue = [];
    this.processing = false;
    this.requestsPerSecond = 1; // Default rate limit
    this.lastProcessTime = Date.now();
    this.lastHeartbeat = Date.now();
    
    // Set component-specific configuration
    this.logger.setComponent('RateLimitedQueue');
    this.rateLimitAggregator.window = this.loggingConfig.getAggregationWindow('RateLimitedQueue');
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      this.lastHeartbeat = Date.now(); // Update heartbeat
      return Promise.resolve();
    }
    
    const context: LogContext = {
      component: 'RateLimitedQueue',
      queueSize: this.queue.length,
      rateLimit: this.requestsPerSecond
    };
    this.logger.debug('Initialize called', { ...context, alreadyInitialized: this.initialized });
    this.logger.info('Initializing rate-limited queue', context);
    this.startProcessing(); // Launch processing in the background
    this.startHeartbeat(); // Start heartbeat monitoring
    this.initialized = true;
    return Promise.resolve();
  }

  async add<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedTask = async () => {

        try {
          const result = await task();
          resolve(result);
          return result;
        } catch (error) {
          const queueError: QueueError = error instanceof Error ? error : new Error(String(error));
          reject(queueError);
          return;
        }
      };
      this.queue.push(wrappedTask);
      // Update heartbeat on task addition
      this.lastHeartbeat = Date.now();
    });
  }

  setRateLimit(requestsPerSecond: number): void {
    this.requestsPerSecond = requestsPerSecond;
    const context: LogContext = {
      component: 'RateLimitedQueue',
      newLimit: requestsPerSecond,
      queueSize: this.queue.length
    };
    
    // Apply a more conservative safety factor
    const safetyFactor = 0.9; // 90% of the requested rate limit
    const minRate = Number(process.env.TWITTER_MIN_RATE) || 0.2; // Increased minimum rate
    const adjustedRate = Math.max(minRate, requestsPerSecond * safetyFactor);
    
    if (adjustedRate !== requestsPerSecond) {
      this.requestsPerSecond = adjustedRate;
      context.adjustedLimit = adjustedRate;
      context.safetyFactor = safetyFactor;
      this.logger.info('Rate limit updated with safety factor', context);
    } else {
      this.logger.info('Rate limit updated', context);
    }
  }

  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;
    
    (async () => {
      while (this.processing) {
        try {
          const task = this.queue.shift();
          if (!task) {
            this.lastHeartbeat = Date.now(); // Update heartbeat during idle periods
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }

          const now = Date.now();
          const timeSinceLastProcess = now - this.lastProcessTime;
          const minInterval = 1000 / this.requestsPerSecond;

          if (timeSinceLastProcess < minInterval) {
            // Add jitter to the delay to avoid synchronized requests
            const jitter = Math.random() * 500; // 0-500ms of jitter
            await new Promise(resolve => 
              setTimeout(resolve, minInterval - timeSinceLastProcess + jitter)
            );
          }

          const taskPromise = task();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Task timeout exceeded')), this.TASK_TIMEOUT);
          });

          try {
            await Promise.race([taskPromise, timeoutPromise]);
          } catch (error) {
            if (error instanceof Error && error.message === 'Task timeout exceeded') {
              const context: LogContext = {
                component: 'RateLimitedQueue',
                timeout: this.TASK_TIMEOUT
              };
              this.logger.error('Queue task timed out', error, context);
              this.metrics.increment('queue.tasks.timeout');
              continue;
            }
            throw error;
          }

          this.lastProcessTime = Date.now();
          this.metrics.increment('queue.tasks.processed');
          
          // Reset consecutive errors on success
          if (this.consecutiveErrors > 0) {
            this.consecutiveErrors = 0;
          }
        } catch (error) {
          const queueError: QueueError = error instanceof Error ? error : new Error(String(error));
          
          // Increment consecutive errors
          this.consecutiveErrors++;
          
          // If we've hit too many consecutive errors, add a backoff delay
          if (this.consecutiveErrors >= this.MAX_CONSECUTIVE_ERRORS) {
            const backoffTime = this.ERROR_BACKOFF_TIME * Math.min(5, Math.floor(this.consecutiveErrors / this.MAX_CONSECUTIVE_ERRORS));
            const errorObj = new Error(`Too many consecutive errors (${this.consecutiveErrors}), backing off for ${backoffTime}ms`);
            const context = {
              component: 'RateLimitedQueue',
              consecutiveErrors: this.consecutiveErrors,
              backoffTime
            };
            this.logger.warn(`Too many consecutive errors (${this.consecutiveErrors}), backing off for ${backoffTime}ms`, errorObj, context);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
          }
          
          // Use aggregated logging for rate limit errors
          if (this.isRateLimitError(queueError)) {
            this.logRateLimit(queueError);
          } else {
            const context: LogContext = {
              component: 'RateLimitedQueue',
              errorDetails: {
                message: queueError.message,
                code: queueError.code || 'UNKNOWN',
                details: queueError.details
              }
            };
            this.logger.error('Error processing queue task', queueError, context);
          }
          
          this.metrics.increment('queue.tasks.errors');
        }
      }
    })();
  }

  private startHeartbeat(): void {
    const heartbeatInterval = Math.max(5000, this.loggingConfig.getHeartbeatInterval('RateLimitedQueue'));
    
    if (this.heartbeatInterval) {
      this.logger.debug('Heartbeat already running, skipping initialization');
      return;
    }
    this.logger.debug('Starting new heartbeat interval');
    
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceHeartbeat = now - this.lastHeartbeat;
      
      // Only log if queue size changed or significant time passed
      const currentQueueSize = this.queue.length;
      if (currentQueueSize !== this.lastQueueSize || timeSinceHeartbeat > heartbeatInterval) {
        const context: LogContext = {
          component: 'RateLimitedQueue',
          size: currentQueueSize,
          active: this.processing,
          timeSinceHeartbeat: timeSinceHeartbeat,
          idle: Math.round((now - this.lastProcessTime) / 1000) + 's'
        };
        this.logger.debug('Queue status', context);
        
        this.lastQueueSize = currentQueueSize;
      }
    }, heartbeatInterval);
  }

  private isRateLimitError(error: QueueError): boolean {
    return error.code === 429 || 
           error.message.includes('TOO_MANY_REQUESTS') || 
           error.message.includes('Rate limit') ||
           error.message.includes('rate_limit');
  }

  private logRateLimit(error: QueueError): void {
    if (this.logger.shouldLog(LogLevel.WARN, this.rateLimitAggregator)) {
      const context: LogContext = {
        component: 'RateLimitedQueue',
        count: this.rateLimitAggregator.count + 1,
        window: `${this.rateLimitAggregator.window}ms`,
        errorDetails: {
          code: error.code,
          message: error.message
        }
      };
      this.logger.warn(
        `Rate limit hit ${this.rateLimitAggregator.count + 1} times in last ${this.rateLimitAggregator.window}ms`,
        error,
        context
      );
      
      // More gradual rate reduction
      const minRate = Number(process.env.TWITTER_MIN_RATE) || 0.2;
      const newRate = Math.max(minRate, this.requestsPerSecond * 0.8); // 20% reduction instead of 50%
      if (newRate < this.requestsPerSecond) {  
        const errorObj = new Error(`Reducing rate limit due to rate limit errors: ${this.requestsPerSecond} -> ${newRate}`);
          const context = {
            component: 'RateLimitedQueue',
          oldRate: this.requestsPerSecond,
          newRate
        };
          this.logger.warn(`Reducing rate limit due to rate limit errors: ${this.requestsPerSecond} -> ${newRate}`, errorObj, context);
        this.requestsPerSecond = newRate;
      }

      // Schedule rate recovery
      const recoveryDelay = 5 * 60 * 1000; // 5 minutes
      setTimeout(() => {
        const recoveryRate = Math.min(1, this.requestsPerSecond * 1.2); // 20% increase up to max 1 req/sec
        if (recoveryRate > this.requestsPerSecond) {
          const context = {
            component: 'RateLimitedQueue',
            oldRate: this.requestsPerSecond,
            recoveryRate
          };
          this.logger.info(`Recovering rate limit: ${this.requestsPerSecond} -> ${recoveryRate}`, context);
          this.requestsPerSecond = recoveryRate;
        }
      }, recoveryDelay);
      
      this.logger.updateAggregator(this.rateLimitAggregator);
    }
  }

  stop(): void {
    if (this.heartbeatInterval) {
      this.logger.debug('Cleaning up heartbeat interval');
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    this.processing = false;
    this.queue = [];
    this.initialized = false;
    const context: LogContext = {
      component: 'RateLimitedQueue',
      remainingTasks: this.queue.length
    };
    this.logger.info('Stopping rate-limited queue', context);
  }
}
