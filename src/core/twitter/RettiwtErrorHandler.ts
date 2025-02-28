import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { LogService } from '../../logging/LogService.js';
import { Logger } from '../../types/logger.js';
import { MetricsManager } from '../../core/monitoring/MetricsManager.js';
import { ErrorHandler, ApiError } from '../../utils/ErrorHandler.js';
import { IErrorHandler } from '../../types/ErrorHandler.js';

@injectable()
export class RettiwtErrorHandler implements IErrorHandler {
  private readonly RETRYABLE_CODES = [500, 502, 503, 504];
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 5000; // 5 seconds
  private retryCount = 0;
  private rateLimitHits = 0;
  private lastRateLimitTime = 0;
  private inCooldown = false;
  private currentCooldownEnd = 0;
  protected baseHandler: ErrorHandler;

  constructor(
    @inject(TYPES.LogService) private logService: LogService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.baseHandler = new ErrorHandler(logService, metrics);
    this.logService = logService.child('RettiwtErrorHandler');
  }

  handle(error: unknown): void {
    // Only log essential error info at debug level
    if (error instanceof Error) {
      this.logService.debug(`RettiwtErrorHandler: ${error.name}`, { message: error.message });
    }
    
    this.handleRettiwtError(error).catch(err => {
      this.logService.error('Error handling Rettiwt error', err);
    });
  }

  isInCooldown(): boolean {
    if (!this.inCooldown) return false;
    
    const now = Date.now();
    if (now >= this.currentCooldownEnd) {
      this.inCooldown = false;
      return false;
    }
    
    const remainingCooldown = Math.ceil((this.currentCooldownEnd - now) / 1000);
    this.logService.debug('Cooldown status check', {
      inCooldown: true,
      remainingSeconds: remainingCooldown,
      cooldownEnd: new Date(this.currentCooldownEnd).toISOString()
    });
    
    return true;
  }

  getRemainingCooldown(): number {
    if (!this.inCooldown) return 0;
    return Math.max(0, this.currentCooldownEnd - Date.now());
  }

  async handleRettiwtError(error: unknown): Promise<void> {
    const errorObj = error as { status?: number; code?: number; message?: string };
    const statusCode = errorObj?.status || errorObj?.code || 500;
    const message = errorObj?.message || String(error);

    // Check if we're still in cooldown
    if (this.isInCooldown()) {
      const remainingCooldown = Math.ceil((this.currentCooldownEnd - Date.now()) / 1000);
      this.logService.debug('Still in cooldown period', {
        remainingSeconds: remainingCooldown,
        rateLimitHits: this.rateLimitHits
      });
      
      await this.delay(5000); // Short delay before retry
      return;
    }

    if (this.isRateLimitError(errorObj)) {
      const now = Date.now();
      this.logService.debug('Rate limit hit', {
        retryCount: this.retryCount,
        rateLimitHits: this.rateLimitHits,
        cooldownTime: Math.round((this.currentCooldownEnd - now)/1000) + 's',
        nextRetry: new Date(this.currentCooldownEnd).toLocaleTimeString()
      });
      this.baseHandler.handleApiError(new ApiError(429, message), 'Rettiwt');
      await this.handleRateLimit();
    } else if (this.isRetryableError(errorObj)) {
      if (this.retryCount < this.MAX_RETRIES) {
        const delay = this.calculateBackoff();
        this.logService.debug(`Retrying after ${delay}ms (attempt ${this.retryCount + 1}/${this.MAX_RETRIES})`);
        await this.delay(delay);
        this.retryCount++;
      } else {
        this.retryCount = 0;
        this.baseHandler.handleApiError(new ApiError(statusCode, `Max retries (${this.MAX_RETRIES}) exceeded`), 'Rettiwt');
      }
    } else {
      this.baseHandler.handleApiError(new ApiError(statusCode, message), 'Rettiwt');
    }
  }

  private isRateLimitError(error: { status?: number; code?: number; message?: string }): boolean {
    this.logService.debug('RettiwtErrorHandler: Checking if rate limit error', {
      status: error.status,
      code: error.code,
      message: error.message
    });
    
    if (error.status === 429 || error.code === 429) {
      return true;
    }
    
    if (typeof error.message === 'string') {
      return error.message.includes('TOO_MANY_REQUESTS') ||
             error.message.includes('Rate limit');
    }
    
    return false;
  }

  private isRetryableError(error: { status?: number; code?: number }): boolean {
    this.logService.debug('RettiwtErrorHandler: Checking if retryable error', {
      status: error.status,
      code: error.code,
      retryableCodes: this.RETRYABLE_CODES
    });
    
    const code = error.status || error.code;
    return typeof code === 'number' && this.RETRYABLE_CODES.includes(code);
  }

  private async handleRateLimit(): Promise<void> {
    const now = Date.now();
    
    // If we're already in cooldown, extend it
    if (this.inCooldown) {
      const extendedCooldown = Math.min(30 * 60 * 1000, (this.currentCooldownEnd - now) * 1.5);
      this.currentCooldownEnd = now + extendedCooldown;
      
      this.logService.warn('Extended existing cooldown', {
        newCooldownEnd: new Date(this.currentCooldownEnd).toISOString(),
        extendedBy: Math.round(extendedCooldown/1000) + 's'
      });
      
      await this.delay(5000); // Short delay before retry
      return;
    }
    
    // Reset rate limit hits if it's been more than 15 minutes
    const timeSinceLastRateLimit = now - this.lastRateLimitTime;
    if (timeSinceLastRateLimit > 15 * 60 * 1000) {
      this.rateLimitHits = 0;
    }
    
    this.rateLimitHits++;
    this.lastRateLimitTime = now;
    
    // Progressive cooldown: 2min -> 5min -> 10min -> 20min -> 30min
    const baseCooldown = 2 * 60 * 1000; // 2 minutes
    const cooldownTime = Math.min(
      30 * 60 * 1000, // Max 30 minutes
      baseCooldown * Math.pow(2, Math.min(4, this.rateLimitHits - 1))
    );
    
    this.inCooldown = true;
    this.currentCooldownEnd = now + cooldownTime;
    
    this.logService.warn('Rate limit reached, entering cooldown', {
      rateLimitHits: this.rateLimitHits,
      cooldownTime: Math.round(cooldownTime/1000) + 's',
      cooldownEnd: new Date(this.currentCooldownEnd).toISOString(),
      timeSinceLastRateLimit: Math.round(timeSinceLastRateLimit/1000) + 's'
    });
    
    await this.delay(cooldownTime);
    
    // After cooldown completes
    this.inCooldown = false;
    this.logService.info('Cooldown period complete', {
      rateLimitHits: this.rateLimitHits,
      totalCooldownTime: Math.round((Date.now() - now)/1000) + 's'
    });
  }

  private calculateBackoff(): number {
    // Exponential backoff with jitter
    const baseDelay = this.BASE_DELAY * Math.pow(2, this.retryCount);
    const jitter = Math.random() * 1000; // 0-1s random jitter
    return Math.min(baseDelay + jitter, 60000); // Cap at 60s
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}