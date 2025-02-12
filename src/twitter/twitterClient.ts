import { TwitterApi, TweetV2, UserV2, MediaObjectV2 } from 'twitter-api-v2';
import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { Tweet, SearchConfig, AffiliatedAccount, ExtendedUserV2 } from '../types/twitter.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TYPES } from '../types/di.js';

@injectable()
export class TwitterClient {
  private client: TwitterApi;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(TYPES.ConfigManager) configManager: ConfigManager
  ) {
    const bearerToken = configManager.getEnvConfig<string>('BEARER_TOKEN');
    if (!bearerToken) {
      throw new Error('BEARER_TOKEN environment variable is required');
    }
    this.client = new TwitterApi(bearerToken);
  }

  async initialize(): Promise<void> {
    try {
      await this.circuitBreaker.execute(() => 
        this.client.v2.search('from:twitter', {
          'tweet.fields': ['created_at']
        })
      );
      this.logger.info('Twitter API connection verified');
    } catch (error) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        process.exit(1);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('403')) {
        throw new Error('Failed to initialize Twitter client: Invalid bearer token or insufficient permissions');
      }
      throw new Error(`Failed to initialize Twitter client: ${errorMessage}`);
    }
  }

  private handleApiError(error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.toLowerCase().includes('401') || 
        errorMessage.toLowerCase().includes('403') ||
        errorMessage.toLowerCase().includes('unauthorized')) {
      this.logger.error('Invalid Twitter bearer token or insufficient permissions. Please check BEARER_TOKEN environment variable');
      process.exit(1);
    }

    if (errorMessage.toLowerCase().includes('429') ||
        errorMessage.toLowerCase().includes('rate limit')) {
      this.logger.error('Twitter API rate limit exceeded. Please wait before retrying.');
      process.exit(1);
    }

    throw error instanceof Error ? error : new Error(errorMessage);
  }

  async searchTweets(query: string, config?: SearchConfig): Promise<Tweet[]> {
    try {
      this.logger.debug(`Executing Twitter search with query: ${query}`);
      const searchParams: any = {
        'tweet.fields': ['created_at', 'author_id', 'entities'],
        'user.fields': ['name', 'username', 'public_metrics'],
        'media.fields': ['url', 'preview_image_url'],
        'expansions': ['author_id', 'attachments.media_keys']
      };

      if (config?.startTime) {
        const date = new Date(config.startTime);
        searchParams.start_time = date.toISOString();
      }

      const result = await this.circuitBreaker.execute(() => 
        this.client.v2.search(query, searchParams)
      );

      if (!result.data || !result.data.data) {
        this.logger.debug('No tweets found in search result');
        return [];
      }

      return result.data.data.map((tweet: TweetV2) => {
        const user = result.includes?.users?.find(u => u.id === tweet.author_id);
        const media = tweet.attachments?.media_keys?.map(key => 
          result.includes?.media?.find(m => m.media_key === key)
        )[0] as MediaObjectV2 | undefined;

        return {
          id: tweet.id,
          text: tweet.text,
          username: user?.username || '',
          displayName: user?.name || '',
          mediaUrl: media?.url || media?.preview_image_url,
          createdAt: tweet.created_at || new Date().toISOString(),
          followersCount: user?.public_metrics?.followers_count,
          followingCount: user?.public_metrics?.following_count
        };
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        return [];
      }

      if (error instanceof Error && 
          (error.message.includes('401') || 
           error.message.includes('403') ||
           error.message.includes('429'))) {
        this.handleApiError(error);
      }

      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
      
      this.logger.error('Failed to search tweets', new Error(errorMessage));
      return [];
    }
  }

  async getAffiliatedAccounts(username: string): Promise<AffiliatedAccount[]> {
    try {
      this.logger.debug(`Fetching affiliated accounts for user: ${username}`);
      
      // Search for tweets mentioning or interacting with the target account
      const userFields: string[] = [
        'name', 'username', 'verified_type', 'subscription_type'
      ];

      const searchResult = await this.circuitBreaker.execute(() => 
        this.client.v2.search(`@${username}`, {
          'tweet.fields': ['author_id', 'created_at'],
          'user.fields': userFields as any,
          'expansions': ['author_id'],
          'max_results': 100
        })
      );

      if (!searchResult.data || !searchResult.includes?.users) {
        this.logger.debug('No interactions found');
        return [];
      }

      // Get unique user IDs from the interactions
      const userIds = [...new Set(searchResult.data.data
        .map(tweet => tweet.author_id)
        .filter((id): id is string => id !== undefined))];
      this.logger.debug(`Found ${userIds.length} unique users interacting with @${username}`);

      // Get detailed user information
      const detailedUserFields: string[] = [
        'name', 'username', 'verified_type', 'subscription_type',
        // Custom fields from the API that need type assertion
        'affiliation'
      ];

      const usersResult = await this.circuitBreaker.execute(() => 
        this.client.v2.users(userIds, {
          'user.fields': detailedUserFields as any,
        })
      );

      if (!usersResult.data) {
        this.logger.debug('No user details found');
        return [];
      }

      // Log raw user data for debugging
      this.logger.debug(`Raw user data: ${JSON.stringify(usersResult.data, null, 2)}`);

      // Filter for accounts with affiliation badges or verified status
      const affiliates: AffiliatedAccount[] = usersResult.data
        .filter((user: ExtendedUserV2) => {
          const hasAffiliation = user.affiliation?.badge_url;
          const isVerifiedBusiness = user.verified_type === 'business';
          const isGovernment = user.verified_type === 'government';
          
          if (hasAffiliation || isVerifiedBusiness || isGovernment) {
            this.logger.debug(`Found affiliated/verified account: ${user.username}`);
          }
          
          return hasAffiliation || isVerifiedBusiness || isGovernment;
        })
        .map((user: ExtendedUserV2) => ({
          id: user.id,
          username: user.username,
          displayName: user.name,
          verified_type: user.verified_type,
          subscription_type: user.subscription_type,
          affiliation: user.affiliation || { badge_url: '', description: '' }
        }));
      this.logger.debug(`Found ${affiliates.length} affiliated/verified accounts`);
      this.logger.debug(`Affiliate details: ${JSON.stringify(affiliates, null, 2)}`);

      return affiliates;

    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        return [];
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to fetch affiliated accounts', new Error(errorMessage));
      
      return [];
    }
  }

  getCircuitBreakerStatus(): { failures: number; isOpen: boolean } {
    return this.circuitBreaker.getStatus();
  }
}
