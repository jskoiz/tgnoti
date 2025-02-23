import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { Tweet, TweetFilter, SearchResponse, TweetUser, mapRettiwtTweetToTweet, SearchQueryConfig } from '../types/twitter.js';
import { MetricsManager } from '../types/metrics.js';
import { RateLimitedQueue } from '../core/RateLimitedQueue.js';
import { RettiwtKeyManager } from './rettiwtKeyManager.js';
import { Rettiwt } from 'rettiwt-api';

interface TwitterError extends Error {
  code: number;
  rateLimitReset?: Date;
  details?: Record<string, unknown>;
}

class RateLimitError extends Error implements TwitterError {
  code = 429;
  constructor(public rateLimitReset: Date) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

class SearchError extends Error implements TwitterError {
  constructor(
    public code: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

interface RettiwtSearchResponse {
  list: any[];
  meta?: { next_token?: string };
}

@injectable()
export class TwitterClient {
  private client: Rettiwt;
  private readonly RETRYABLE_CODES = [500, 502, 503, 504];
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 1000; // 1 second
  private readonly API_TIMEOUT = 15000; // 15 seconds
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.RateLimitedQueue) private queue: RateLimitedQueue,
    @inject(TYPES.RettiwtKeyManager) private keyManager: RettiwtKeyManager
  ) {
    // Initialize queue with appropriate rate limit (5 requests per second)
    this.queue.setRateLimit(5);
    this.client = this.createClient();
  }

  /**
   * Create a new Rettiwt client instance with the current API key
   */
  private createClient(): Rettiwt {
    const apiKey = this.keyManager.getCurrentKey();
    
    // Validate API key format
    if (!this.isValidApiKey(apiKey)) {
      this.logger.error('Invalid API key format', {
        keyLength: apiKey?.length || 0,
        keyPrefix: apiKey?.substring(0, 4),
        isBase64: this.isBase64(apiKey)
      });
      throw new Error('Invalid API key format');
    }
    
    this.logger.debug('Creating Rettiwt client with key', {
      keyLength: apiKey?.length || 0,
      keyPrefix: apiKey?.substring(0, 4),
      currentKeyIndex: this.keyManager.getCurrentKeyIndex(),
      isBase64: this.isBase64(apiKey)
    });

    
    return new Rettiwt({ 
      apiKey: apiKey,
      timeout: this.REQUEST_TIMEOUT
    });
  }

  /**
   * Search tweets with pagination support
   */
  async searchTweets(filter: TweetFilter): Promise<SearchResponse> {
    const startTime = Date.now();
    try {
      this.metrics.increment('twitter.search.attempt');
      this.logger.debug('Starting tweet search with filter:', { filter });
      
      await this.queue.initialize(); // Ensure queue is initialized
      const result = await this.queue.add(async () => {
        const searchParams = this.sanitizeSearchParams(filter);
        const response = await this.performSearch(searchParams);
        
        const searchResponse: SearchResponse = {
          data: response,
          meta: {
            next_token: response.length >= (filter.maxResults || 100) ? 
              this.generateNextToken(response[response.length - 1].id) : undefined
          }
        };

        return searchResponse;
      });

      this.metrics.increment('twitter.search.success');
      this.metrics.timing('twitter.search.duration', Date.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.increment('twitter.search.error');
      this.metrics.timing('twitter.search.error_duration', Date.now() - startTime);
      
      const wrappedError = this.wrapError(error);
      this.logger.error('Error searching tweets:', { error: wrappedError });
      throw wrappedError;
    }
  }

  /**
   * Get user details by username
   */
  async getUserDetails(username: string): Promise<TweetUser> {
    const startTime = Date.now();
    try {
      this.metrics.increment('twitter.user.fetch.attempt');
      this.logger.debug('Fetching user details:', { username });
      
      const result = await this.queue.add(async () => {
        throw new Error('Not implemented');
      });

      this.metrics.increment('twitter.user.fetch.success');
      this.metrics.timing('twitter.user.fetch.duration', Date.now() - startTime);
      return result;
    } catch (error) {
      this.metrics.increment('twitter.user.fetch.error');
      this.metrics.timing('twitter.user.fetch.error_duration', Date.now() - startTime);
      
      const wrappedError = this.wrapError(error);
      this.logger.error('Error fetching user details:', { error: wrappedError });
      throw wrappedError;
    }
  }

  /**
   * Perform the actual search request with retries
   */
  private async performSearch(params: TweetFilter): Promise<Tweet[]> {
    let retryCount = 0;
    let lastError: Error | null = null;

    // Convert TweetFilter to SearchQueryConfig
    const searchConfig: SearchQueryConfig = {
      type: 'structured',
      accounts: params.fromUsers,
      mentions: params.mentions,
      keywords: params.includeWords,
      language: params.language || 'en',
      startTime: params.startDate?.toISOString(),
      endTime: params.endDate?.toISOString(),
      minLikes: params.minLikes,
      minRetweets: params.minRetweets,
      minReplies: params.minReplies
    };

    this.logger.debug('Starting search with config:', {
      accounts: searchConfig.accounts,
      startTime: searchConfig.startTime,
      endTime: searchConfig.endTime
    });

    while (retryCount <= this.MAX_RETRIES) {
      try {
        // Validate client before search
        if (!this.client?.tweet?.search) {
          this.logger.error('Invalid Rettiwt client state', {
            hasClient: !!this.client,
            hasSearchMethod: !!(this.client?.tweet?.search)
          });
          throw new Error('Invalid Rettiwt client state');
        }

        this.logger.debug('Attempting search with client', {
          retryCount,
          hasClient: !!this.client,
          hasSearchMethod: !!(this.client?.tweet?.search)
        });

        // Log the exact request being made
        this.logger.debug('Making Rettiwt API request', {
          method: 'search',
          config: searchConfig,
          timeout: this.REQUEST_TIMEOUT
        });

        // Create a timeout promise that resolves to RettiwtSearchResponse
        const timeoutPromise = new Promise<RettiwtSearchResponse>((_, reject) => {
          setTimeout(() => {
            const error = new Error('Search request timed out');
            this.logger.error('API timeout exceeded', {
              timeout: this.API_TIMEOUT,
              config: searchConfig
            });
            reject(error);
          }, this.API_TIMEOUT);
        });

        // Race between the search request and timeout
        const result = await Promise.race<RettiwtSearchResponse>([
          this.client.tweet.search(searchConfig) as Promise<RettiwtSearchResponse>,
          timeoutPromise as Promise<RettiwtSearchResponse>
        ]).catch(error => {
          this.logger.error('Search request failed or timed out', {
            error: error.message,
            stack: error.stack,
            code: error.code,
            status: error.status,
            details: error.details || {}
          });
          throw error;
        });

        if (!result || !result.list) throw new Error('Invalid search response');

        // Mark key as successful
        this.keyManager.markKeySuccess();
        this.logger.debug('Search successful', {
          resultCount: result.list.length,
          firstTweetId: result.list[0]?.id,
          config: searchConfig
        });

        this.logger.debug('Search response mapped successfully');
        // Use the mapping function to transform tweets
        return result.list.map(tweet => mapRettiwtTweetToTweet(tweet));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Enhanced error logging
        this.logger.error('Search attempt failed:', {
          errorType: error?.constructor?.name || typeof error,
          errorInstance: error instanceof Error ? 'Error' : typeof error,
          retryCount,
          errorCode: (error as any)?.status || (error as any)?.code,
          errorMessage: lastError.message,
          errorStack: lastError.stack,
          currentKeyIndex: this.keyManager.getKeyCount()
        });

        // Log raw error object for debugging
        this.logger.error('Raw error details:', {
          error: JSON.stringify(error, Object.getOwnPropertyNames(error)),
          hasErrorPrototype: Object.prototype.toString.call(error) === '[object Error]',
          errorKeys: Object.keys(error || {})
        });

        // Handle rate limiting
        if (this.isRateLimitError(error)) {
          this.metrics.increment('twitter.search.ratelimit');
          await this.handleRateLimit(error);
          continue; // Retry immediately with new key
        }

        // Handle retryable errors
        if (this.isRetryableError(error)) {
          this.metrics.increment('twitter.search.retry');
          if (retryCount < this.MAX_RETRIES) {
            await this.delay(this.getBackoffDelay(retryCount));
            retryCount++;
            continue;
          }
        }

        // Handle key errors
        this.keyManager.markKeyError(error);
        this.client = this.createClient(); // Recreate client with new key

        // If not retryable or max retries reached, throw
        throw this.wrapError(lastError);
      }
    }

    throw this.wrapError(lastError || new Error('Max retries exceeded'));
  }

  /**
   * Sanitize search parameters
   */
  private sanitizeSearchParams(params: TweetFilter): TweetFilter {
    const sanitized = {
      ...params,
      fromUsers: params.fromUsers?.map(u => u.replace('@', '')),
      mentions: params.mentions?.map(u => u.replace('@', ''))
    };

    // Remove pagination properties before sending to API
    delete sanitized.maxResults;
    delete sanitized.paginationToken;

    return sanitized;
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): error is RateLimitError {
    return error?.status === 429 || error?.code === 429;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const code = error?.status || error?.code;
    return this.RETRYABLE_CODES.includes(code);
  }

  /**
   * Handle rate limit error
   */
  private async handleRateLimit(error: any): Promise<void> {
    const resetTime = new Date(Date.now() + 15 * 60 * 1000); // Default 15 minutes
    this.keyManager.markKeyError(new RateLimitError(resetTime));
    this.client = this.createClient(); // Recreate client with new key
  }

  /**
   * Calculate exponential backoff delay
   */
  private getBackoffDelay(retryCount: number): number {
    return Math.min(this.BASE_DELAY * Math.pow(2, retryCount), 30000); // Max 30 seconds
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wrap error in appropriate type
   */
  private wrapError(error: any): TwitterError {
    if (error instanceof RateLimitError || error instanceof SearchError) {
      return error;
    }

    const code = error?.status || error?.code || 500;
    const message = error?.message || String(error);
    const details = error?.details || undefined;

    return new SearchError(code, message, details);
  }

  /**
   * Generate a pagination token based on the last tweet ID
   */
  private generateNextToken(lastTweetId: string): string {
    return Buffer.from(lastTweetId).toString('base64');
  }

  /**
   * Check if string is valid base64
   */
  private isBase64(str: string): boolean {
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }

  private isValidApiKey(key: string): boolean {
    return typeof key === 'string' && key.length >= 32 && this.isBase64(key);
  }
}
