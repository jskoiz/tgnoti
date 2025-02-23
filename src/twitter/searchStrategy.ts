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
      const results: Tweet[] = [];
      let searchErrors = 0;
      
      // Execute searches sequentially
      const searches = [
        // Single search - only direct tweets from the account
        {
          type: 'structured' as const,
          accounts: [topic.username],
          mentions: [],
          keywords: [],
          language: topic.language || 'en',
          startTime: topic.startDate?.toISOString(),
          endTime: topic.endDate?.toISOString(),
          excludeRetweets: topic.excludeRetweets ?? true,
          excludeQuotes: topic.excludeQuotes ?? true
        }
      ];

      this.logger.debug(`Starting sequential searches for ${topic.username}`, {
        searchCount: searches.length,
        dateRange: `${topic.startDate?.toISOString()} to ${topic.endDate?.toISOString()}`
      });

      for (let i = 0; i < searches.length; i++) {
        const searchConfig = searches[i];
        const searchType = 'base';
        
        try {
          // Check cache first
          const cached = await this.cacheManager.get(searchConfig);
          if (cached) {
            this.logger.debug(`Cache hit for ${searchType} search`, {
              resultCount: cached.length,
              searchIndex: i + 1,
              totalSearches: searches.length
            });
            results.push(...cached);
            continue;
          }

          // Perform search if not in cache
          this.logger.debug(`Starting ${searchType} search (${i + 1}/${searches.length})`);
          let searchResults: Tweet[] = [];
          
          // Log cache check
          this.logger.debug('Checking cache', {
            searchType,
            config: searchConfig
          });
          
          try {
            this.logger.debug(`Executing search request for ${searchType}`, { config: searchConfig });
            searchResults = await this.performSearch(searchConfig);
            this.logger.debug(`Search request completed for ${searchType}`, { resultCount: searchResults.length });
          } catch (error) {
            throw new Error(`Search failed for ${searchType}: ${error instanceof Error ? error.message : String(error)}`);
          }
          
          this.logger.debug(`Completed ${searchType} search`, {
            resultCount: searchResults.length,
            searchIndex: i + 1,
            totalSearches: searches.length
          });
          
          results.push(...searchResults);
          
          // Cache successful results
          if (searchResults.length > 0) {
            this.cacheManager.set(searchConfig, searchResults);
          }
        } catch (error) {
          searchErrors++;
          this.logger.error(`${searchType} search failed (${searchErrors}/${searches.length})`, {
            error: error instanceof Error ? error.message : String(error),
            searchIndex: i + 1,
            totalSearches: searches.length
          });
          // Continue with next search even if this one failed
          continue;
        }
      }

      const uniqueTweets = this.deduplicateTweets(results);
      this.logger.debug('Search sequence completed', {
        totalResults: results.length,
        uniqueResults: uniqueTweets.length,
        searchErrors,
        successfulSearches: searches.length - searchErrors
      });

      return uniqueTweets;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Fatal error in search sequence:', { error: errorMessage });
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
      // Add detailed logging
      this.logger.debug('Building search filter', {
        type: searchConfig.type,
        accounts: searchConfig.accounts,
        startTime: searchConfig.startTime,
        endTime: searchConfig.endTime
      });
      const filter = this.searchBuilder.buildFilter(searchConfig);
      this.logger.debug('Executing search', {
        type: searchConfig.type,
        accounts: searchConfig.accounts,
        mentions: searchConfig.mentions,
        keywords: searchConfig.keywords
      });

      this.logger.debug('Calling Twitter API...');
      const response = await this.twitterClient.searchTweets(filter);
      
      this.logger.debug('Search completed', {
        type: searchConfig.type,
        resultCount: response.data.length,
        hasNextPage: !!response.meta?.next_token
      });
      
      return response.data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Search error:', {
        error: errorMessage,
        type: searchConfig.type,
        accounts: searchConfig.accounts,
        keywords: searchConfig.keywords
      });
      throw error; // Propagate error to be handled by caller
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