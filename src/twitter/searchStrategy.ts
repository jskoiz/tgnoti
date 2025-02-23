import { injectable, inject } from 'inversify';
import { Tweet, SearchQueryConfig, PaginatedSearch, SearchResponse } from '../types/twitter.js';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { TwitterClient } from './twitterClient.js';
import { RettiwtSearchBuilder } from './rettiwtSearchBuilder.js';
import { SearchCacheManager } from './SearchCacheManager.js';

@injectable()
export class SearchStrategy {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.RettiwtSearchBuilder) private searchBuilder: RettiwtSearchBuilder,
    @inject(TYPES.SearchCacheManager) private cacheManager: SearchCacheManager
  ) {}

  /**
   * Perform a comprehensive search using sequential execution
   */
  async search(topic: { username: string; startDate?: Date; endDate?: Date }): Promise<Tweet[]> {
    try {
      const results: Tweet[] = [];
      
      // Execute searches sequentially
      const searches = [
        // Base search by username
        {
          type: 'structured' as const,
          accounts: [topic.username],
          language: 'en',
          startTime: topic.startDate?.toISOString(),
          endTime: topic.endDate?.toISOString()
        },
        // Mentions search
        {
          type: 'structured' as const,
          mentions: [topic.username],
          keywords: [topic.username.toLowerCase()],
          language: 'en',
          startTime: topic.startDate?.toISOString(),
          endTime: topic.endDate?.toISOString()
        },
        // Keyword search
        {
          type: 'structured' as const,
          keywords: [topic.username.toLowerCase()],
          language: 'en',
          startTime: topic.startDate?.toISOString(),
          endTime: topic.endDate?.toISOString()
        },
        // Quote tweets search
        {
          type: 'structured' as const,
          accounts: [topic.username],
          keywords: [topic.username.toLowerCase()],
          language: 'en',
          startTime: topic.startDate?.toISOString(),
          endTime: topic.endDate?.toISOString(),
          excludeRetweets: true,
          excludeQuotes: false
        }
      ];

      for (const searchConfig of searches) {
        // Check cache first
        const cached = await this.cacheManager.get(searchConfig);
        if (cached) {
          this.logger.debug('Cache hit for search query');
          results.push(...cached);
          continue;
        }

        // Perform search if not in cache
        const searchResults = await this.performSearch(searchConfig);
        results.push(...searchResults);
      }

      return this.deduplicateTweets(results);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error performing sequential searches:', { error: errorMessage });
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error performing paginated search:', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Perform a single search operation with caching
   */
  private async performSearch(searchConfig: SearchQueryConfig): Promise<Tweet[]> {
    try {
      const filter = this.searchBuilder.buildFilter(searchConfig);
      const response = await this.twitterClient.searchTweets(filter);
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error performing search:', { error: errorMessage });
      return []; // Return empty array on error to allow other searches to continue
    }
  }

  /**
   * Deduplicate tweets based on tweet ID
   */
  private deduplicateTweets(tweets: Tweet[]): Tweet[] {
    const seen = new Set<string>();
    return tweets.filter(tweet => {
      if (seen.has(tweet.id)) return false;
      seen.add(tweet.id);
      return true;
    });
  }
}