import { injectable, inject } from 'inversify';
import { Tweet, SearchQueryConfig, PaginatedSearch, SearchResponse } from '../../types/twitter.js';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { TwitterClient } from './twitterClient.js';
import { RettiwtSearchBuilder } from './rettiwtSearchBuilder.js';
import { SearchCacheManager } from './SearchCacheManager.js';
import { UsernameHandler } from '../../utils/usernameHandler.js';

@injectable()
export class SearchStrategy {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.RettiwtSearchBuilder) private searchBuilder: RettiwtSearchBuilder,
    @inject(TYPES.SearchCacheManager) private cacheManager: SearchCacheManager,
    @inject(TYPES.UsernameHandler) private usernameHandler: UsernameHandler
  ) {}

  /**
   * Perform a search for tweets containing @username (catches both tweets from and mentions)
   */
  async search(topic: {
    username: string;
    startDate?: Date;
    endDate?: Date;
    excludeRetweets?: boolean;
    excludeQuotes?: boolean;
    language?: string;
    operator?: 'AND' | 'OR' | 'NOT';
  }): Promise<Tweet[]> {
    try {
      const normalizedUsername = this.usernameHandler.normalizeUsername(topic.username);
      
      // Create a combined search configuration instead of separate ones
      const combinedConfig: SearchQueryConfig = {
        type: 'structured',
        accounts: [normalizedUsername],
        mentions: [normalizedUsername],
        keywords: [],
        language: topic.language || 'en',
        startTime: topic.startDate?.toISOString(),
        endTime: topic.endDate?.toISOString(),
        excludeRetweets: topic.excludeRetweets ?? true,
        excludeQuotes: topic.excludeQuotes ?? true,
        operator: 'OR',
        advancedFilters: { include_replies: true }
      };

      this.logger.debug(`Starting search for ${topic.username}`, {
        dateRange: `${topic.startDate?.toISOString()} to ${topic.endDate?.toISOString()}`
      });

      // Perform a single search instead of parallel searches
      const allTweets = await this.performSearch(combinedConfig);

      // Validate tweets
      const validTweets = allTweets.filter(tweet => 
        this.usernameHandler.isUsernameMatch(tweet.tweetBy.userName, normalizedUsername) ||
        tweet.entities?.mentionedUsers?.some(mention => 
          this.usernameHandler.isUsernameMatch(mention, normalizedUsername)
        )
      );

      // Sort by creation date, newest first
      validTweets.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      
      // Cache the results
      if (validTweets.length > 0) {
        await this.cacheManager.set(combinedConfig, validTweets);
      }

      this.logger.debug('Search completed', {
        totalCount: validTweets.length,
        username: normalizedUsername
      });

      return validTweets;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error in combined search', err);
      throw error;
    }
  }

  /**
   * Perform a paginated search operation
   */
  async searchWithPagination(
    searchConfig: SearchQueryConfig,
    limit: number = 100
  ): Promise<PaginatedSearch> {
    try {
      // Add a small delay before search to help with rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check cache first
      const cached = await this.cacheManager.get(searchConfig);
      if (cached) {
        this.logger.debug('Cache hit for search query');
        return {
          tweets: cached,
          cursor: { hasMore: false } // Cached results don't support pagination
        };
      }

      const filter = this.searchBuilder.buildFilter(searchConfig);
      const response = await this.twitterClient.searchTweets({
        ...filter,
        maxResults: limit,
        paginationToken: searchConfig.cursor?.nextToken
      });

      // Log detailed date analysis for each tweet
      const requestedStartTime = searchConfig.startTime ? new Date(searchConfig.startTime) : null;
      const requestedEndTime = searchConfig.endTime ? new Date(searchConfig.endTime) : null;
      
      response.data.forEach(tweet => {
        const tweetDate = new Date(tweet.createdAt);
        const tweetAgeMinutes = requestedEndTime ? 
          (requestedEndTime.getTime() - tweetDate.getTime()) / (60 * 1000) : 
          (new Date().getTime() - tweetDate.getTime()) / (60 * 1000);
        
        this.logger.debug('Tweet date analysis from API', {
          tweetId: tweet.id,
          tweetDate: tweetDate.toISOString(),
          requestedStartTime: requestedStartTime?.toISOString(),
          requestedEndTime: requestedEndTime?.toISOString(),
          tweetAgeMinutes: tweetAgeMinutes.toFixed(2)
        });
      });

      // Sort tweets by creation date, newest first
      response.data.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      this.logger.debug('Sorted tweets by creation date, newest first');

      // Cache the results
      this.cacheManager.set(searchConfig, response.data);

      return {
        tweets: response.data,
        cursor: {
          nextToken: response.meta?.next_token,
          hasMore: !!response.meta?.next_token
        }
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error performing paginated search', err);
      throw error;
    }
  }

  /**
   * Perform a single search operation with caching
   */
  private async performSearch(searchConfig: SearchQueryConfig): Promise<Tweet[]> {
    try {
      this.logger.debug('Building search filter', {
        type: searchConfig.type,
        keywords: searchConfig.keywords,
        accounts: searchConfig.accounts,
        mentions: searchConfig.mentions,
        startTime: searchConfig.startTime,
        endTime: searchConfig.endTime
      });

      const filter = this.searchBuilder.buildFilter(searchConfig);
      
      this.logger.debug('Calling Twitter API...');
      const response = await this.twitterClient.searchTweets(filter);

      // Sort tweets by creation date, newest first
      response.data.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB.getTime() - dateA.getTime();
      });
      this.logger.debug('Sorted tweets by creation date, newest first');
      
      this.logger.debug('Search completed', {
        resultCount: response.data.length,
        hasNextPage: !!response.meta?.next_token
      });
      
      return response.data;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Search error', err, {
        type: searchConfig.type,
        keywords: searchConfig.keywords,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }
}