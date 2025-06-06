import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { Tweet } from '../types/twitter.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { TwitterClient } from '../core/twitter/twitterClient.js';

@injectable()
export class TwitterService {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TwitterClient) private client: TwitterClient
  ) {
    this.logger.setComponent('TwitterService');
  }
  
  /**
   * Search for tweets from or mentioning a specific account
   * @param account The account to search for
   * @param since The date to search from
   * @param searchType Whether to search for tweets from the account or mentioning the account
   * @returns An array of tweets
   */
  async searchTweets(account: string, since: Date, searchType: 'from' | 'mention' = 'from'): Promise<Tweet[]> {
    const startTime = Date.now();
    this.metrics.increment('twitter.search_requests');

    try {
      const sinceStr = since.toISOString();

      // More explicit logging for clarity
      if (searchType === 'from') {
        this.logger.info(`[SEARCH] Looking for tweets AUTHORED BY @${account} since ${sinceStr}`);
      } else {
        this.logger.info(`[SEARCH] Looking for tweets MENTIONING @${account} since ${sinceStr}`);
      }

      // Simplified and more explicit search parameters
      const searchParams: any = {
        startDate: since,
        endDate: new Date(),
        language: 'en',
        maxResults: 100,
        replies: true,
        // Always set both parameters for clarity, but only one will be used based on search type
        fromUsers: searchType === 'from' ? [account] : undefined,
        mentions: searchType === 'mention' ? [account] : undefined
      };

      const searchResponse = await this.client.searchTweets(searchParams);

      const tweets = searchResponse.data;
      
      // Add post-processing filter to ensure we only get tweets FROM the specified user
      // This is a safety measure in case the Rettiwt API doesn't properly filter by author
      let filteredTweets = tweets;
      if (searchType === 'from' && searchParams.fromUsers && searchParams.fromUsers.length > 0) {
        const targetUsername = searchParams.fromUsers[0].toLowerCase().replace('@', '');
        
        // Log all tweets before filtering for debugging
        if (tweets.length > 0) {
          this.logger.debug(`Pre-filter tweets (${tweets.length}):`);
          tweets.forEach((tweet, idx) => {
            this.logger.debug(`Tweet ${idx+1}: ID=${tweet.id}, by @${tweet.tweetBy.userName}, match=${tweet.tweetBy.userName.toLowerCase() === targetUsername}`);
          });
        }
        
        // More flexible username matching - normalize both usernames
        filteredTweets = tweets.filter(tweet => {
          const tweetUsername = tweet.tweetBy.userName.toLowerCase().replace('@', '');
          const isMatch = tweetUsername === targetUsername;
          
          if (!isMatch) {
            this.logger.debug(`Username mismatch: tweet by @${tweet.tweetBy.userName} (${tweetUsername}) != target @${targetUsername}`);
          }
          
          return isMatch;
        });
        
        if (filteredTweets.length !== tweets.length) {
          this.logger.warn(`Filtered out ${tweets.length - filteredTweets.length} tweets that were not authored by @${targetUsername}`);
          this.logger.debug(`Tweet filtering details: original=${tweets.length}, filtered=${filteredTweets.length}`);
        }
      }

      // Sort tweets by creation date (newest first)
      filteredTweets.sort((a: Tweet, b: Tweet) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      const duration = Date.now() - startTime;
      
      // More explicit result logging
      if (searchType === 'from') {
        this.logger.info(`[SEARCH RESULT] Found ${filteredTweets.length} tweets AUTHORED BY @${account} in ${duration}ms`);
        
        // Log the first few tweets for debugging
        if (filteredTweets.length > 0) {
          const sampleSize = Math.min(filteredTweets.length, 3);
          for (let i = 0; i < sampleSize; i++) {
            this.logger.debug(`Tweet ${i+1}/${sampleSize}: ID=${filteredTweets[i].id}, by @${filteredTweets[i].tweetBy.userName}, text="${filteredTweets[i].text.substring(0, 50)}..."`);
          }
        }
      } else {
        this.logger.info(`[SEARCH RESULT] Found ${filteredTweets.length} tweets MENTIONING @${account} in ${duration}ms`);
      }
      
      this.metrics.timing('twitter.search_duration', duration);
      this.metrics.gauge('twitter.tweets_found', filteredTweets.length);

      return filteredTweets;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Error searching tweets ${searchType === 'from' ? 'from' : 'mentioning'} account ${account}:`, error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('twitter.search_errors');
      this.metrics.timing('twitter.error_duration', duration);
      throw error;
    }
  }

  /**
   * Search for tweets from multiple users in a single query
   * @param accounts Array of accounts to search for tweets from
   * @param since The date to search from
   * @returns An array of tweets
   */
  async searchTweetsFromUsers(accounts: string[], since: Date): Promise<Tweet[]> {
    const startTime = Date.now();
    this.metrics.increment('twitter.batch_search_requests');

    try {
      const sinceStr = since.toISOString();
      this.logger.info(`[BATCH SEARCH] Looking for tweets AUTHORED BY ${accounts.length} accounts since ${sinceStr}`);
      this.logger.debug(`Accounts in batch: ${accounts.join(', ')}`);

      // Search parameters for tweets FROM multiple users
      const searchParams: any = {
        fromUsers: accounts,
        startDate: since,
        endDate: new Date(),
        language: 'en',
        maxResults: 100,
        replies: true,
        advancedFilters: {
          include_replies: true,
          fromUsers: accounts // Redundant but ensures compatibility
        }
      };

      try {
        const searchResponse = await this.client.searchTweets(searchParams);
        const tweets = searchResponse.data;
        
        // Filter to ensure we only get tweets FROM the specified users
        const targetUsernames = accounts.map(account => account.toLowerCase().replace('@', ''));
        
        // Log all tweets before filtering for debugging
        if (tweets.length > 0) {
          this.logger.debug(`Pre-filter tweets (${tweets.length}):`);
          tweets.forEach((tweet, idx) => {
            const tweetUsername = tweet.tweetBy.userName.toLowerCase().replace('@', '');
            const isMatch = targetUsernames.includes(tweetUsername);
            this.logger.debug(`Tweet ${idx+1}: ID=${tweet.id}, by @${tweet.tweetBy.userName}, match=${isMatch}`);
          });
        }
        
        // Filter tweets to only include those from the specified users
        const filteredTweets = tweets.filter(tweet => {
          const tweetUsername = tweet.tweetBy.userName.toLowerCase().replace('@', '');
          return targetUsernames.includes(tweetUsername);
        });
        
        if (filteredTweets.length !== tweets.length) {
          this.logger.warn(`Filtered out ${tweets.length - filteredTweets.length} tweets that were not authored by the specified accounts`);
        }

        // Sort tweets by creation date (newest first)
        filteredTweets.sort((a: Tweet, b: Tweet) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        const searchDuration = Date.now() - startTime;
        this.logger.info(`[BATCH SEARCH RESULT] Found ${filteredTweets.length} tweets from ${accounts.length} accounts in ${searchDuration}ms`);
        
        this.metrics.timing('twitter.batch_search_duration', searchDuration);
        this.metrics.gauge('twitter.batch_tweets_found', filteredTweets.length);

        return filteredTweets;
      } catch (batchError) {
        // If the batch search fails with a 404, log it but don't throw
        // The EnhancedTweetMonitor will handle the fallback to individual searches
        if (batchError instanceof Error && 
            (batchError.message.includes('404') || 
             (batchError as any)?.response?.status === 404)) {
          
          this.logger.warn(`Batch search returned 404 error, caller should fall back to individual searches`);
          this.logger.debug(`Batch details:`, {
            batchSize: accounts.length,
            sampleAccounts: accounts.slice(0, 3).join(', ')
          });
          
          // Rethrow with enhanced message to signal the need for fallback
          const enhancedError = new Error(`Batch search endpoint returned 404: ${batchError.message}`);
          throw enhancedError;
        }
        
        // For other errors, just rethrow
        throw batchError;
      }
    } catch (error) {
      const errorDuration = Date.now() - startTime;
      this.logger.error(`Error searching tweets from multiple accounts:`, error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('twitter.batch_search_errors');
      this.metrics.timing('twitter.batch_error_duration', errorDuration);
      throw error;
    }
  }

  /**
   * Search for tweets mentioning multiple users in a single query
   * @param accounts Array of accounts to search for mentions of
   * @param since The date to search from
   * @returns An array of tweets
   */
  async searchTweetsMentioningUsers(accounts: string[], since: Date): Promise<Tweet[]> {
    const startTime = Date.now();
    this.metrics.increment('twitter.batch_mention_requests');

    try {
      const sinceStr = since.toISOString();
      this.logger.info(`[BATCH SEARCH] Looking for tweets MENTIONING ${accounts.length} accounts since ${sinceStr}`);
      this.logger.debug(`Accounts in batch: ${accounts.join(', ')}`);

      // Search parameters for tweets MENTIONING multiple users
      const searchParams: any = {
        mentions: accounts,
        startDate: since,
        endDate: new Date(),
        language: 'en',
        maxResults: 100,
        replies: true
      };

      try {
        const searchResponse = await this.client.searchTweets(searchParams);
        const tweets = searchResponse.data;

        // Sort tweets by creation date (newest first)
        tweets.sort((a: Tweet, b: Tweet) => {
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
        });

        const searchDuration = Date.now() - startTime;
        this.logger.info(`[BATCH SEARCH RESULT] Found ${tweets.length} tweets mentioning ${accounts.length} accounts in ${searchDuration}ms`);
        
        this.metrics.timing('twitter.batch_mention_duration', searchDuration);
        this.metrics.gauge('twitter.batch_mention_found', tweets.length);

        return tweets;
      } catch (batchError) {
        // If the batch search fails with a 404, log it but don't throw
        // The EnhancedTweetMonitor will handle the fallback to individual searches
        if (batchError instanceof Error && 
            (batchError.message.includes('404') || 
             (batchError as any)?.response?.status === 404)) {
          
          this.logger.warn(`Mentions batch search returned 404 error, caller should fall back to individual searches`);
          this.logger.debug(`Batch details:`, {
            batchSize: accounts.length,
            sampleAccounts: accounts.slice(0, 3).join(', ')
          });
          
          // Rethrow with enhanced message to signal the need for fallback
          const enhancedError = new Error(`Mentions batch search endpoint returned 404: ${batchError.message}`);
          throw enhancedError;
        }
        
        // For other errors, just rethrow
        throw batchError;
      }
    } catch (error) {
      const errorDuration = Date.now() - startTime;
      this.logger.error(`Error searching tweets mentioning multiple accounts:`, error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('twitter.batch_mention_errors');
      this.metrics.timing('twitter.batch_mention_error_duration', errorDuration);
      throw error;
    }
  }
}