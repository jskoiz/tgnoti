import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from '../services/ConfigService.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { RateLimitInfo } from '../types/monitoring-enhanced.js';

@injectable()
export class EnhancedRateLimiter {
  private lastRequestTime: Map<string, number> = new Map();
  private rateLimitRemaining: Map<string, number> = new Map();
  private rateLimitReset: Map<string, number> = new Map();
  private rateLimitTotal: Map<string, number> = new Map();
  private consecutiveErrors: Map<string, number> = new Map();
  private backoffMultiplier: Map<string, number> = new Map();
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('EnhancedRateLimiter');
  }
  
  /**
   * Acquire a rate limit token for a specific category and identifier
   * @param category The rate limit category (e.g., 'twitter', 'telegram')
   * @param identifier The specific identifier within the category (e.g., 'account:username', 'topic:123')
   */
  async acquireRateLimit(category: string, identifier: string): Promise<void> {
    const key = `${category}:${identifier}`;
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(key) || 0;
    const minInterval = this.calculateMinInterval(category, identifier);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 100;
    const waitTime = Math.max(0, lastRequest + minInterval + jitter - now);
    
    if (waitTime > 0) {
      this.logger.debug(`Rate limiting ${key} for ${waitTime}ms`);
      this.metrics.timing('rate_limit.wait_time', waitTime);
      this.metrics.increment(`rate_limit.${category}.delays`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime.set(key, Date.now());
    this.metrics.increment(`rate_limit.${category}.requests`);
  }
  
  /**
   * Update rate limit information from API response headers
   * @param category The rate limit category
   * @param remaining Number of requests remaining in the window
   * @param resetTime Time when the rate limit resets (epoch ms)
   * @param limit Total number of requests allowed in the window
   */
  updateRateLimitInfo(category: string, remaining: number, resetTime: number, limit: number = 0): void {
    this.rateLimitRemaining.set(category, remaining);
    this.rateLimitReset.set(category, resetTime);
    
    if (limit > 0) {
      this.rateLimitTotal.set(category, limit);
    }
    
    this.metrics.gauge(`rate_limit.${category}.remaining`, remaining);
    
    // If we're getting close to the limit, log a warning
    const remainingPercent = limit > 0 ? (remaining / limit) * 100 : 0;
    if (remainingPercent < 20) {
      this.logger.warn(`Rate limit for ${category} is low: ${remaining}/${limit} (${remainingPercent.toFixed(1)}%)`);
    }
    
    // Reset backoff if we're not close to the limit
    if (remainingPercent > 50) {
      this.backoffMultiplier.set(category, 1);
      this.consecutiveErrors.set(category, 0);
    }
  }
  
  /**
   * Get current rate limit information for a category
   * @param category The rate limit category
   */
  getRateLimitInfo(category: string): RateLimitInfo | null {
    const remaining = this.rateLimitRemaining.get(category);
    const resetTime = this.rateLimitReset.get(category);
    const limit = this.rateLimitTotal.get(category);
    
    if (remaining === undefined || resetTime === undefined) {
      return null;
    }
    
    return {
      remaining,
      resetTime,
      limit: limit || 0
    };
  }
  
  /**
   * Handle a rate limit error by increasing backoff
   * @param category The rate limit category
   * @param identifier The specific identifier within the category
   */
  handleRateLimitError(category: string, identifier: string): void {
    const key = `${category}:${identifier}`;
    const errors = (this.consecutiveErrors.get(key) || 0) + 1;
    this.consecutiveErrors.set(key, errors);
    
    // Increase backoff multiplier exponentially
    const currentBackoff = this.backoffMultiplier.get(key) || 1;
    const newBackoff = Math.min(currentBackoff * 2, 60); // Max 60x backoff
    this.backoffMultiplier.set(key, newBackoff);
    
    this.logger.warn(`Rate limit error for ${key}, increasing backoff to ${newBackoff}x (${errors} consecutive errors)`);
    this.metrics.increment(`rate_limit.${category}.errors`);
    this.metrics.gauge(`rate_limit.${category}.backoff`, newBackoff);
  }
  
  /**
   * Reset backoff for a specific category and identifier
   * @param category The rate limit category
   * @param identifier The specific identifier within the category
   */
  resetBackoff(category: string, identifier: string): void {
    const key = `${category}:${identifier}`;
    this.backoffMultiplier.set(key, 1);
    this.consecutiveErrors.set(key, 0);
    this.logger.debug(`Reset backoff for ${key}`);
  }
  
  /**
   * Calculate minimum interval between requests based on category, identifier, and current rate limit status
   * @param category The rate limit category
   * @param identifier The specific identifier within the category
   */
  private calculateMinInterval(category: string, identifier: string): number {
    const key = `${category}:${identifier}`;
    const twitterConfig = this.config.getTwitterConfig();
    let baseInterval: number;
    
    // Get base interval based on category
    switch (category) {
      case 'twitter':
        baseInterval = 1000 / twitterConfig.rateLimit.requestsPerSecond;
        break;
      case 'topic':
        baseInterval = twitterConfig.rateLimit.topicDelayMs;
        break;
      case 'telegram':
        baseInterval = 500; // 2 messages per second by default
        break;
      default:
        baseInterval = 1000; // Default to 1 request per second
    }
    
    // Apply backoff multiplier if any
    const backoff = this.backoffMultiplier.get(key) || 1;
    const interval = baseInterval * backoff;
    
    // Ensure we don't go below the minimum rate
    const minRate = twitterConfig.rateLimit.minRate;
    const maxInterval = minRate > 0 ? 1000 / minRate : 10000; // Default to 10 seconds if minRate is 0
    
    return Math.min(interval, maxInterval);
  }
  
  /**
   * Calculate exponential backoff with jitter
   * @param attempts Number of attempts so far
   * @param baseDelay Base delay in ms
   * @param maxDelay Maximum delay in ms
   */
  calculateBackoff(attempts: number, baseDelay: number = 1000, maxDelay: number = 60000): number {
    // Exponential backoff: 2^attempts * baseDelay
    const exponentialDelay = Math.min(
      maxDelay,
      Math.pow(2, attempts) * baseDelay
    );
    
    // Add jitter (0-20% random variation)
    const jitterFactor = 0.8 + (Math.random() * 0.4); // 0.8-1.2
    return exponentialDelay * jitterFactor;
  }
}