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
import { Environment } from '../../config/environment.js';

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
    @inject(TYPES.LoggingConfig) private loggingConfig: LoggingConfig,
    @inject(TYPES.Environment) private environment: Environment
  ) {
    this.logger.setComponent('TwitterClient');
    
    // Get rate limit from config
    const config = this.environment.getConfig().twitter.rateLimit;
    const rateLimit = config.requestsPerSecond;
    this.logger.info('Setting Twitter API rate limit', { rateLimit, safetyFactor: config.safetyFactor });
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
    
    // Add very detailed logging for API key validation
    this.logger.debug(`Validating API key format: length=${apiKey?.length || 0}, prefix=${apiKey?.substring(0, 4) || 'none'}`);
    this.logger.debug(`API key contains auth_token: ${apiKey?.includes('auth_token=')}`);
    this.logger.debug(`API key contains twid: ${apiKey?.includes('twid=')}`);
    
    // Try to create the client regardless of validation
    try {
      const client = new Rettiwt({ 
        apiKey: apiKey,
        timeout: this.REQUEST_TIMEOUT
      });
      
      this.logger.debug('Successfully created Rettiwt client', {
        clientKeys: Object.keys(client || {}),
        hasTweet: !!client.tweet,
        tweetKeys: Object.keys(client.tweet || {})
      });
      
      return client;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error creating Rettiwt client: ${err.message}`);
      throw new Error(`Failed to create Rettiwt client: ${err.message}`);
    }
    
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
      const err = error instanceof Error ? error : new Error(String(error));
      
      // Only increment metrics for rate limit errors, let the error handler manage the rest
      this.metrics.increment('twitter.search.error');
      this.metrics.timing('twitter.search.error_duration', Date.now() - startTime);
      
      // For rate limits, just pass to error handler without additional logging
      if (err.message?.includes('TOO_MANY_REQUESTS') || err.message?.includes('Rate limit')) {
        this.errorHandler.handle(error);
      }
      throw err;
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

    // Add detailed logging for search parameters
    this.logger.debug('Twitter search parameters', {
      accounts: params.fromUsers,
      startTime: params.startDate?.toISOString(),
      endTime: params.endDate?.toISOString(),
      language: params.language || 'en'
    });

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

     // Log client state before search
      this.logger.debug(`Client state before search: hasClient=${!!this.client}, hasSearchMethod=${!!this.client?.tweet?.search}`);
      
      try {
       const result = await this.client.tweet.search(searchConfig) as RettiwtSearchResponse;
        
        // Log successful search
        this.logger.debug(`Search successful, received ${result?.list?.length || 0} results`);
        
        if (!result?.list) {
          this.logger.warn(`Invalid search response: missing list property. Available keys: ${result ? Object.keys(result).join(', ') : 'null'}`);
          throw new Error('Invalid search response');
        }
        
        // Log first result for debugging
        if (result.list.length > 0) {
          const firstTweet = result.list[0];
          this.logger.debug(`First tweet in results: ID=${firstTweet.id || 'unknown'}, by @${firstTweet.user?.username || 'unknown'}`);
        }
        
        return result.list.map(tweet => mapRettiwtTweetToTweet(tweet));
      } catch (searchError) {
        // Specific error handling for the search call
        this.logger.error(`Search API call failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`);
        throw searchError;
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      // Add detailed error logging
      const hasResponse = !!(error as any)?.response;
      const responseStatus = (error as any)?.response?.status;
      const responseHeaders = (error as any)?.response?.headers;
      this.logger.error(`Error in Twitter search: ${errorObj.message}. Response status: ${responseStatus || 'none'}`);
      
      const errorContext = this.createLogContext({
        errorDetails: {
          type: errorObj.constructor.name,
          message: errorObj.message,
          stack: errorObj.stack
        }
      });
      
      // Extract retry-after header from Rettiwt response
      const retryAfter = (error as any)?.response?.headers?.['retry-after'];
      if (retryAfter) {
        const enhancedError = new Error('TOO_MANY_REQUESTS');
        (enhancedError as any).response = { headers: { 'retry-after': retryAfter } };
        throw enhancedError;
      }
      throw errorObj;
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
    const isValid = typeof key === 'string' && key.length >= 32 && key.includes('auth_token=') && key.includes('twid=');
    
    // Add detailed logging for key validation
    this.logger.debug('API key validation result', {
      isString: typeof key === 'string',
      hasMinLength: key?.length >= 32,
      hasAuthToken: key?.includes('auth_token='),
      hasTwid: key?.includes('twid='),
      isValid
    });
    
    return isValid;
  }
}
