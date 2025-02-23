import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { Tweet, SearchQueryConfig } from '../types/twitter.js';
import { TopicFilterManager } from '../bot/TopicFilterManager.js';
import { SearchStrategy } from '../twitter/searchStrategy.js';
import { TYPES } from '../types/di.js';
import { Storage } from '../storage/storage.js';

@injectable()
export class TweetMonitor {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TopicFilterManager) private topicFilterManager: TopicFilterManager,
    @inject(TYPES.SearchStrategy) private searchStrategy: SearchStrategy,
    @inject(TYPES.Storage) private storage: Storage
  ) {}

  async initialize(): Promise<void> {
    this.logger.info('Initializing tweet monitor');
  }

  async start(intervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Tweet monitor is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting tweet monitor with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkTweets();
      } catch (error) {
        this.errorHandler.handleError(
          error instanceof Error ? error : new Error('Unknown error'),
          'TweetMonitor'
        );
      }
    }, intervalMs);
  }

  private async checkTweets(): Promise<void> {
    try {
      this.metrics.increment('monitor.checks');
      this.logger.debug('Checking for new tweets');

      const tweets = await this.getTweets();
      
      if (tweets.length > 0) {
        this.metrics.increment('monitor.tweets.found', tweets.length);
        this.logger.debug(`Found ${tweets.length} new tweets`);
      }

    } catch (error) {
      this.metrics.increment('monitor.errors');
      throw error;
    }
  }

  private async getTweets(): Promise<Tweet[]> {
    const allTweets: Tweet[] = [];
    const processedTopics = new Set<number>();

    try {
      // Get all topics with filters
      const config = await this.storage.getConfig();
      const topics = config.telegram.topics || {};
      const topicIds = Object.keys(topics);

      for (const topicId of topicIds) {
        const numericTopicId = parseInt(topicId);
        if (processedTopics.has(numericTopicId)) continue;

        try {
          // Get filters for this topic
          const filters = await this.topicFilterManager.getFilters(numericTopicId);
          if (!filters.length) continue;

          // Get last tweet ID for this topic
          const lastTweetId = await this.storage.getLastTweetId(topicId);

          // Group filters by type
          const userFilters = filters.filter(f => f.type === 'user').map(f => f.value);
          const mentionFilters = filters.filter(f => f.type === 'mention').map(f => f.value);
          const keywordFilters = filters.filter(f => f.type === 'keyword').map(f => f.value);

          // Build search query
          const searchConfig: SearchQueryConfig = {
            type: 'structured',
            accounts: userFilters,
            mentions: mentionFilters,
            keywords: keywordFilters,
            startTime: lastTweetId ? undefined : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            language: 'en',
            excludeRetweets: true,
            operator: 'OR'
          };

          // Execute search
          const searchResults = await this.searchStrategy.searchWithPagination(searchConfig, 100);

          // Process tweets
          for (const tweet of searchResults.tweets) {
            if (!await this.storage.hasSeen(tweet.id, topicId)) {
              allTweets.push(tweet);
              await this.storage.markSeen(tweet.id, topicId);
            }
          }

          // Update last tweet ID if we found any tweets
          if (searchResults.tweets.length > 0) {
            await this.storage.updateLastTweetId(
              topicId,
              searchResults.tweets[0].id // First tweet is the most recent
            );
          }

          processedTopics.add(numericTopicId);
        } catch (error) {
          this.logger.error(`Error processing topic ${topicId}:`, error as Error);
          continue; // Continue with next topic even if one fails
        }
      }
    } catch (error) {
      this.logger.error('Error in getTweets:', error as Error);
      throw error;
    }

    return allTweets;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Tweet monitor is not running');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isRunning = false;
    this.logger.info('Tweet monitor stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}