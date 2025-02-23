import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { Tweet, TweetFilter, SearchResponse, TweetUser, mapRettiwtTweetToTweet } from '../types/twitter.js';
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

@injectable()
export class TwitterClient {
  private client: Rettiwt;
  private readonly RETRYABLE_CODES = [500, 502, 503, 504];
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY = 1000; // 1 second

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.RateLimitedQueue) private queue: RateLimitedQueue,
    @inject(TYPES.RettiwtKeyManager) private keyManager: RettiwtKeyManager
  ) {
    this.client = this.createClient();
  }

  /**
   * Create a new Rettiwt client instance with the current API key
   */
  private createClient(): Rettiwt {
    const apiKey = this.keyManager.getCurrentKey();
    return new Rettiwt({ 
      apiKey: apiKey
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

    while (retryCount <= this.MAX_RETRIES) {
      try {
        const result = await this.client.tweet.search({
          ...params,
          fromUsers: params.fromUsers?.map(user => user.replace('@', '')),
          mentions: params.mentions?.map(user => user.replace('@', ''))
        });

        // Mark key as successful
        this.keyManager.markKeySuccess();

        // Use the mapping function to transform tweets
        return result.list.map(tweet => mapRettiwtTweetToTweet(tweet));
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
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
      mentions: params.mentions?.map(u => u.replace('@', '')),
      startTime: params.startDate?.toISOString(),
      endTime: params.endDate?.toISOString()
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
}
