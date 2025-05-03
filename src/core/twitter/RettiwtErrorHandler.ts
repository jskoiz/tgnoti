import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { LogService } from '../../logging/LogService.js';
import { Logger } from '../../types/logger.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { ErrorHandler, ApiError, RateLimitError } from '../../utils/ErrorHandler.js';
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
    this.handleRettiwtError(error).catch(() => {}); // Suppress error handler errors
  }

  isInCooldown(): boolean {
    if (!this.inCooldown) return false;
    
    const now = Date.now();
    if (now >= this.currentCooldownEnd) {
      this.inCooldown = false;
      return false;
    }
    
    const remainingCooldown = Math.ceil((this.currentCooldownEnd - now) / 1000);
    this.logService.debug('[RATE LIMIT STATUS] Cooldown active', {
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
    const retryAfterHeader = (error as any)?.response?.headers?.['retry-after'];
    const statusCode = errorObj?.status || errorObj?.code || 500;
    const message = errorObj?.message || String(error);

    // Extract retry-after from headers if available
    let retryAfter: number | undefined;
    this.logService.debug('Processing retry-after header', {
      retryAfterHeader,
      headerType: typeof retryAfterHeader,
      rawValue: retryAfterHeader
    });
    
    if (typeof retryAfterHeader === 'string') retryAfter = parseInt(retryAfterHeader, 10) * 1000; // Convert to milliseconds
    if (retryAfter) this.logService.debug('Parsed retry-after value', { retryAfter });

    // Check if we're still in cooldown
    if (this.isInCooldown()) {
      const remainingCooldown = Math.ceil((this.currentCooldownEnd - Date.now()) / 1000);
      this.logService.warn('[RATE LIMIT ACTIVE] Still in cooldown period', {
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
      this.baseHandler.handleApiError(new RateLimitError(message, retryAfter), 'Rettiwt');
      await this.handleRateLimit(retryAfter);
    } else if (this.isNotFoundError(errorObj)) {
      // Handle 404 errors differently - these are likely API endpoint issues
      this.logService.error(`API Endpoint Error (404): ${message}`);
      this.logService.debug('API Endpoint Error details', {
        errorStatus: errorObj.status,
        errorCode: errorObj.code,
        endpoint: (error as any)?.config?.url || 'unknown'
      });
      
      // Don't increment retry count for 404 errors as they're not transient
      this.baseHandler.handleApiError(new ApiError(404, `API Endpoint Not Found: ${message}`), 'Rettiwt');
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
      const msg = error.message.toLowerCase();
      return msg.includes('too_many_requests') || msg.includes('rate limit');
    }
    
    return false;
  }

  /**
   * Check if the error is a 404 Not Found error, which indicates an API endpoint issue
   * rather than a rate limit or server error
   */
  private isNotFoundError(error: { status?: number; code?: number; message?: string }): boolean {
    return error.status === 404 || error.code === 404 ||
           (typeof error.message === 'string' && error.message.includes('404'));
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

  private async handleRateLimit(retryAfter?: number): Promise<void> {
    const now = Date.now();
    
    // Use retry-after if available
    if (typeof retryAfter === 'number' && retryAfter > 0) {
      this.logService.warn(`[RATE LIMIT COOLDOWN] API-specified cooldown: ${Math.ceil(retryAfter / 1000)} seconds`);
      await this.delay(retryAfter);
      return;
    }
    
    // If we're already in cooldown, extend it
    if (this.inCooldown) {
      const extendedCooldown = Math.min(30 * 60 * 1000, (this.currentCooldownEnd - now) * 1.5);
      this.currentCooldownEnd = now + extendedCooldown;
      
      this.logService.warn('[RATE LIMIT EXTENDED] Extended existing cooldown', {
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
    
    // Progressive cooldown: 4min -> 8min -> 16min -> 30min -> 30min
    const baseCooldown = 4 * 60 * 1000; // 4 minutes
    const cooldownTime = Math.min(
      30 * 60 * 1000, // Max 30 minutes
      baseCooldown * Math.pow(2, Math.min(4, this.rateLimitHits - 1))
    );
    
    this.inCooldown = true;
    this.currentCooldownEnd = now + cooldownTime;
    
    this.logService.warn(`[RATE LIMIT COOLDOWN] Progressive backoff: ${Math.round(cooldownTime/1000)} seconds (hit #${this.rateLimitHits})`);
    await this.delay(cooldownTime);
    
    // After cooldown completes
    this.inCooldown = false;
    this.logService.info('[RATE LIMIT COMPLETE] Cooldown period complete', {
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