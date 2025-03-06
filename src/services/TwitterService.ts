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
      
      this.logger.debug(`Searching tweets ${searchType === 'from' ? 'from' : 'mentioning'} ${account} since ${sinceStr}`);
      
      // Create search parameters based on search type
      const searchParams: any = {
        startDate: since,
        endDate: new Date(),
        language: 'en',
        maxResults: 100,
        replies: true
      };
      
      // Set the appropriate search parameter based on search type
      if (searchType === 'from') {
        searchParams.fromUsers = [account];
      } else {
        searchParams.mentions = [account];
      }
      
      const searchResponse = await this.client.searchTweets(searchParams);
      
      const tweets = searchResponse.data;
      
      // Sort tweets by creation date (newest first)
      tweets.sort((a: Tweet, b: Tweet) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      const duration = Date.now() - startTime;
      this.logger.debug(`Found ${tweets.length} tweets ${searchType === 'from' ? 'from' : 'mentioning'} ${account} in ${duration}ms`);
      this.metrics.timing('twitter.search_duration', duration);
      this.metrics.gauge('twitter.tweets_found', tweets.length);
      
      return tweets;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Error searching tweets ${searchType === 'from' ? 'from' : 'mentioning'} account ${account}:`, error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('twitter.search_errors');
      this.metrics.timing('twitter.error_duration', duration);
      throw error;
    }
  }
}