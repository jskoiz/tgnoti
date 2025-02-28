import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { Logger, LogContext } from '../../types/logger.js';
import { Tweet, TweetFilter, SearchResponse, TweetUser, mapRettiwtTweetToTweet, mapRettiwtUserToTweetUser, SearchQueryConfig } from '../../types/twitter.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { RateLimitedQueue } from '../RateLimitedQueue.js';
import { RettiwtKeyManager } from './rettiwtKeyManager.js';
import { LoggingConfig } from '../../config/loggingConfig.js';
import { Rettiwt } from 'rettiwt-api';
import { RettiwtErrorHandler } from './RettiwtErrorHandler.js';

interface RettiwtSearchResponse {
  list: any[];
  meta?: { next_token?: string };
}

@injectable()
export class TwitterClient {
  private client: Rettiwt;
  private readonly REQUEST_TIMEOUT = 120000; // 120 seconds

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.RateLimitedQueue) private queue: RateLimitedQueue,
    @inject(TYPES.RettiwtKeyManager) private keyManager: RettiwtKeyManager,
    @inject(TYPES.RettiwtErrorHandler) private errorHandler: RettiwtErrorHandler,
    @inject(TYPES.LoggingConfig) private loggingConfig: LoggingConfig
  ) {
    this.logger.setComponent('TwitterClient');
    
    // Get rate limit from environment variable or use default
    const rateLimit = Number(process.env.TWITTER_RATE_LIMIT) || 1;
    this.logger.info(`Setting Twitter API rate limit to ${rateLimit} requests per second`);
    this.queue.setRateLimit(rateLimit);
    this.client = this.createClient();
  }

  private createLogContext(additionalContext: Record<string, any> = {}): LogContext {
    return {
      component: 'TwitterClient',
      ...additionalContext
    };
  }

  private createClient(): Rettiwt {
    const apiKey = this.keyManager.getCurrentKey();
    
    // Validate API key format
    if (!this.isValidApiKey(apiKey)) {
      const context = this.createLogContext({
        keyLength: apiKey?.length || 0,
        keyPrefix: apiKey?.substring(0, 4),
        isBase64: this.isBase64(apiKey)
      });
      this.logger.error('Invalid API key format', new Error('Invalid API key'), context);
      throw new Error('Invalid API key format');
    }
    
    const context = this.createLogContext({
      keyLength: apiKey?.length || 0,
      keyPrefix: apiKey?.substring(0, 4),
      currentKeyIndex: this.keyManager.getCurrentKeyIndex(),
      isBase64: this.isBase64(apiKey)
    });
    this.logger.debug('Creating Rettiwt client', context);

    return new Rettiwt({ 
      apiKey: apiKey,
      timeout: this.REQUEST_TIMEOUT
    });
  }

  async getUserDetails(username: string): Promise<TweetUser | null> {
    try {
      if (!this.client?.user?.details) {
        throw new Error('User API not available');
      }

      const normalizedUsername = username.replace('@', '').toLowerCase();
      const user = await this.client.user.details(normalizedUsername);
      
      if (!user) {
        return null;
      }

      return mapRettiwtUserToTweetUser(user);
    } catch (error) {
      this.logger.debug('TwitterClient: Error in getUserDetails before handling', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error)
      });
      this.errorHandler.handle(error);
      return null;
    }
  }

  async searchTweets(filter: TweetFilter): Promise<SearchResponse> {
    const startTime = Date.now();
    try {
      this.metrics.increment('twitter.search.attempt');
      const context = this.createLogContext({ filter });
      this.logger.debug('Starting tweet search', context);
      
      await this.queue.initialize();
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
      
      // Let the error handler manage retries and cooldowns
      this.errorHandler.handle(error);
      throw error;
    }
  }

  private async performSearch(params: TweetFilter): Promise<Tweet[]> {
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
      minReplies: params.minReplies,
      excludeRetweets: true,
      excludeQuotes: true,
      advancedFilters: { include_replies: params.replies || false }
    };

    const context = this.createLogContext({
      accounts: searchConfig.accounts,
      startTime: searchConfig.startTime,
      endTime: searchConfig.endTime,
      excludeRetweets: searchConfig.excludeRetweets,
      excludeQuotes: searchConfig.excludeQuotes
    });
    this.logger.debug('Starting search with config', context);

    // Check if we're in cooldown before attempting search
    if (this.errorHandler.isInCooldown()) {
      const remainingCooldown = this.errorHandler.getRemainingCooldown();
      this.logger.debug('Search attempted during cooldown', {
        remainingMs: remainingCooldown,
        remainingSeconds: Math.ceil(remainingCooldown / 1000)
      });
      await this.delay(5000); // Short delay before throwing
      throw new Error('TOO_MANY_REQUESTS');
    }

    try {
      if (!this.client?.tweet?.search) {
        const invalidContext = this.createLogContext({
          hasClient: !!this.client,
          hasSearchMethod: !!(this.client?.tweet?.search)
        });
        this.logger.error('Invalid Rettiwt client state', new Error('Invalid client state'), invalidContext);
        throw new Error('Invalid Rettiwt client state');
      }

      const result = await this.client.tweet.search(searchConfig) as RettiwtSearchResponse;
      
      if (!result?.list) {
        throw new Error('Invalid search response');
      }

      const successContext = this.createLogContext({
        resultCount: result.list.length,
        firstTweetId: result.list[0]?.id,
        config: searchConfig
      });
      this.logger.debug('Search successful', successContext);
      
      return result.list.map(tweet => mapRettiwtTweetToTweet(tweet));
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorContext = this.createLogContext({
        errorDetails: {
          type: errorObj.constructor.name,
          message: errorObj.message,
          stack: errorObj.stack
        }
      });
      this.logger.error(`Search attempt failed`, errorObj, errorContext);
      throw error;
    }
  }

  private sanitizeSearchParams(params: TweetFilter): TweetFilter {
    const sanitized = {
      ...params,
      fromUsers: params.fromUsers?.map((u: string) => u.replace('@', '')),
      mentions: params.mentions?.map((u: string) => u.replace('@', ''))
    };

    delete sanitized.maxResults;
    delete sanitized.paginationToken;

    return sanitized;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateNextToken(lastTweetId: string): string {
    return Buffer.from(lastTweetId).toString('base64');
  }

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
