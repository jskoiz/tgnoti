import { injectable, inject } from 'inversify';
import { Tweet, SearchQueryConfig, PaginatedSearch, SearchResponse, TweetFilter } from '../../types/twitter.js';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { TwitterClient } from './twitterClient.js';
import { RettiwtSearchBuilder } from './rettiwtSearchBuilder.js';
import { SearchCacheManager } from './SearchCacheManager.js';
import { UsernameHandler } from '../../utils/usernameHandler.js';

@injectable()
export class SearchStrategy {
  private lastSearchTime: Map<string, number> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.RettiwtSearchBuilder) private searchBuilder: RettiwtSearchBuilder,
    @inject(TYPES.SearchCacheManager) private cacheManager: SearchCacheManager,
    @inject(TYPES.UsernameHandler) private usernameHandler: UsernameHandler
  ) {
    this.logger.setComponent('SearchStrategy');
  }

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
      // Add detailed logging for search parameters
      this.logger.debug('Starting search with parameters', {
        username: topic.username,
        startDate: topic.startDate?.toISOString(),
        endDate: topic.endDate?.toISOString(),
        excludeRetweets: topic.excludeRetweets,
        excludeQuotes: topic.excludeQuotes,
        language: topic.language
      });
      
      const normalizedUsername = this.usernameHandler.normalizeUsername(topic.username);

      // Check rate limiting
      const now = Date.now();
      const lastSearch = this.lastSearchTime.get(normalizedUsername) || 0;
      const timeSinceLastSearch = now - lastSearch;
      
      if (timeSinceLastSearch < 60000) { // 1 minute minimum between searches
        this.logger.debug('Using cached results due to per-account rate limit', {
          username: normalizedUsername,
          timeSinceLastSearch: Math.round(timeSinceLastSearch / 1000) + 's'
        });
        const cached = await this.cacheManager.get({
          type: 'structured',
          accounts: [normalizedUsername],
          language: topic.language || 'en'
        });
        if (cached) return this.sortTweets(cached);
      }
      this.lastSearchTime.set(normalizedUsername, now);
      
      // Create a combined search configuration
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

      // Check cache first
      const cached = await this.cacheManager.get(combinedConfig);
      if (cached) {
        this.logger.debug('Using cached search results', {
          username: normalizedUsername,
          tweetCount: cached.length
        });
        return this.sortTweets(cached);
      }

      // Perform search
      const searchResult = await this.searchWithPagination(combinedConfig, 100);

      // Add very detailed logging for search results
      this.logger.debug(`Search results received for ${normalizedUsername}: ${searchResult.tweets.length} tweets`);
      if (searchResult.tweets.length > 0) {
        this.logger.debug(`First tweet in results: ID=${searchResult.tweets[0].id}, by @${searchResult.tweets[0].tweetBy?.userName}`);
      }
      
      // Validate tweets
      const validTweets = searchResult.tweets.filter((tweet: Tweet) => 
        this.usernameHandler.isUsernameMatch(tweet.tweetBy.userName, normalizedUsername) ||
        tweet.entities?.mentionedUsers?.some((mention: string) => 
          this.usernameHandler.isUsernameMatch(mention, normalizedUsername)
        )
      );

      // Cache the results
      if (validTweets.length > 0) {
        await this.cacheManager.set(combinedConfig, validTweets);
      }

      return this.sortTweets(validTweets);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error in combined search for ${topic.username}: ${err.message} (${err.constructor.name})`, err);
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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay to 1s
      
      // Check cache first
      const cached = await this.cacheManager.get(searchConfig);
      if (cached) {
        return {
          tweets: this.sortTweets(cached),
          cursor: { hasMore: false } // Cached results don't support pagination
        };
      }

      const startTime = Date.now();

      const startTimeStr = new Date(searchConfig.startTime || '').toLocaleTimeString('en-US');
      const endTimeStr = new Date(searchConfig.endTime || '').toLocaleTimeString('en-US');

      // Debug log to verify searchConfig contents
      this.logger.debug('Search config received:', {
        searchId: searchConfig.searchId,
        timeWindow: `${startTimeStr} - ${endTimeStr}`
      });

      // Log search start with topic ID
      this.logger.debug(`Starting search for topic ${searchConfig.searchId}`, {
        timeWindow: `${startTimeStr} - ${endTimeStr}`,
        searchId: searchConfig.searchId
      });

      // Build filter and perform search
      const filter = this.searchBuilder.buildFilter(searchConfig);
      const tweetFilter: TweetFilter = {
        ...filter,
        maxResults: limit,
        paginationToken: searchConfig.cursor?.nextToken
      };

      // Add very detailed logging before API call
      this.logger.debug(`Calling Twitter API for ${tweetFilter.fromUsers?.join(', ') || 'unknown'}`);
      this.logger.debug(`Search time range: ${tweetFilter.startDate?.toISOString()} to ${tweetFilter.endDate?.toISOString()}`);
      
      const response = await this.twitterClient.searchTweets(tweetFilter);
      const duration = Date.now() - startTime;

      // Use topicId or username as searchId for better logging
      const searchId = searchConfig.searchId || 
                      (searchConfig.accounts && searchConfig.accounts.length > 0 ? 
                       searchConfig.accounts[0] : 'unknown');

      // Log search completion with topic ID
      this.logger.info(`Search completed: ${response.data.length} tweets found in ${duration}ms (${searchId}: ${startTimeStr} - ${endTimeStr})`, {
        status: 'SEARCH_COMPLETED',
        searchId,
        tweetCount: response.data.length,
        durationMs: duration,
        timeWindow: `${startTimeStr} - ${endTimeStr}`
      });
      
      // Log a summary of tweets found instead of individual tweets
      if (response.data.length > 0) {
        // Calculate age distribution
        const ageDistribution: Record<string, number> = {};
        
        // Safely calculate age distribution
        for (const tweet of response.data) {
          try {
            if (tweet.createdAt) {
              const ageInMinutes = Math.round((Date.now() - new Date(tweet.createdAt).getTime()) / (60 * 1000));
              const category = ageInMinutes <= 30 ? '0-30m' : ageInMinutes <= 60 ? '30-60m' : ageInMinutes <= 180 ? '1-3h' : ageInMinutes <= 360 ? '3-6h' : ageInMinutes <= 720 ? '6-12h' : '12h+';
              ageDistribution[category] = (ageDistribution[category] || 0) + 1;
            }
          } catch (e) {
            // Skip tweets with invalid dates
          }
        }
        
        this.logger.info(`Found ${response.data.length} tweets in search`, {
          status: 'TWEETS_FOUND_SUMMARY' as string,
          ageDistribution
        });
      }

      // Cache the results
      await this.cacheManager.set(searchConfig, response.data);

      return {
        tweets: this.sortTweets(response.data),
        cursor: {
          nextToken: response.meta?.next_token,
          hasMore: !!response.meta?.next_token
        }
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error performing paginated search for ${searchConfig.searchId || 'unknown'}: ${err.message} (${err.constructor.name})`, err);
      throw error;
    }
  }

  /**
   * Sort tweets by creation date, newest first
   */
  private sortTweets(tweets: Tweet[]): Tweet[] {
    return tweets.sort((a, b) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
  }
}