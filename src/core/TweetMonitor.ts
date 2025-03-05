import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TwitterClient } from './twitter/twitterClient.js';
import { MetricsManager } from './monitoring/MetricsManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { Tweet, SearchQueryConfig } from '../types/twitter.js';
import { TopicFilterManager } from '../telegram/bot/TopicFilterManager.js';
import { SearchStrategy } from './twitter/searchStrategy.js';
import { TYPES } from '../types/di.js';
import { Storage } from './storage/storage.js';
import { SearchConfig } from '../config/searchConfig.js';
import { getTopicById } from '../config/topicConfig.js';

@injectable()
export class TweetMonitor {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastPollTime: Date | null = null;
  private currentSearchStartTime: Date | null = null;
  private overlapBufferMs: number;
  private initialWindowMinutes: number;
  private topicDelayMs: number;
  private initialStartupDelay: boolean = true;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TopicFilterManager) private topicFilterManager: TopicFilterManager,
    @inject(TYPES.SearchStrategy) private searchStrategy: SearchStrategy,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig
  ) {
    // Initialize configuration values
    this.overlapBufferMs = this.searchConfig.getOverlapBufferMinutes() * 60 * 1000;
    this.initialWindowMinutes = this.searchConfig.getSearchWindowMinutes();
    // Increase default topic delay to 2 minutes to prevent rate limiting
    this.topicDelayMs = Number(process.env.TWITTER_TOPIC_DELAY_MS) || 120000;
    this.logger.setComponent('TweetMonitor');
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing tweet monitor');
    this.lastPollTime = null; // Reset on initialization
  }

  async start(intervalMs?: number): Promise<void> {
    // Use the environment variable for polling interval or fallback to the provided value or default
    intervalMs = Number(process.env.TWITTER_POLLING_INTERVAL) || intervalMs || 300000; // Default to 5 minutes
    if (this.isRunning) {
      this.logger.warn('Tweet monitor is already running');
      return;
    }

    this.isRunning = true;
    this.initialStartupDelay = true;
    this.logger.info(`Starting tweet monitor with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(async () => {
      try {
        // Add a staggered startup delay to prevent immediate rate limiting
        if (this.initialStartupDelay) {
          this.initialStartupDelay = false;
          const startupDelay = Math.floor(Math.random() * 120 + 60) * 1000; // 60-180 second random delay
          await new Promise(resolve => setTimeout(resolve, startupDelay));
        }

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
      // Calculate search window
      if (this.lastPollTime) {
        this.currentSearchStartTime = new Date(this.lastPollTime.getTime() - this.overlapBufferMs);
      } else {
        this.currentSearchStartTime = new Date(Date.now() - (this.initialWindowMinutes * 60 * 1000));
      }

      const cycleStartTime = this.currentSearchStartTime;
      const cycleEndTime = new Date();
      
      this.logger.info(`Search cycle: ${cycleStartTime.toISOString()} to ${cycleEndTime.toISOString()}`);

      const tweets = await this.getTweets(cycleStartTime, cycleEndTime);
      this.lastPollTime = new Date();
      
      this.logger.info(`Search cycle complete: ${tweets.length} tweets found`, {
        window: `${Math.round((cycleEndTime.getTime() - cycleStartTime.getTime()) / 60000)}m`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.metrics.increment('monitor.errors');
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Tweet check failed:', err);
      throw error;
    }
  }

  private async getTweets(searchStartTime: Date, searchEndTime: Date): Promise<Tweet[]> {
    const allTweets: Tweet[] = [];
    const seenTweetIds = new Set<string>();
    let duplicateCount = { total: 0, byTopic: 0 };
    const processedTopics = new Set<number>();

    try {
      // Get all topics with filters
      const config = await this.storage.getConfig();
      const topics = config.telegram.topicIds || {};
      
      const topicIds = Object.keys(topics);
      
      for (let i = 0; i < topicIds.length; i++) {
        const topicId = topicIds[i];
        const numericTopicId = parseInt(topicId);
        
        if (isNaN(numericTopicId)) {
          this.logger.warn('⚠️ Invalid topic ID format', new Error(`Invalid topic ID: ${topicId}`));
          continue;
        }
        if (processedTopics.has(numericTopicId)) continue;

        // Add progressive delay between topics
        if (i > 0) {
          const baseDelay = this.topicDelayMs;
          const progressiveFactor = Math.min(2, 1 + (i * 0.1));
          const jitter = Math.random() * 10000;
          const actualDelay = Math.floor(baseDelay * progressiveFactor + jitter);
          await new Promise(resolve => setTimeout(resolve, actualDelay));
        }

        try {
          const filters = await this.topicFilterManager.getFilters(numericTopicId);
          if (!filters.length) {
            this.logger.warn('⚠️ No filters configured for topic', new Error(`Topic ${numericTopicId} has no filters`));
            continue;
          }

          // Group filters by type
          const userFilters = filters.filter((f: { type: string }) => f.type === 'user').map((f: { value: string }) => f.value);
          const mentionFilters = filters.filter((f: { type: string }) => f.type === 'mention').map((f: { value: string }) => f.value);
          const keywordFilters = filters.filter((f: { type: string }) => f.type === 'keyword').map((f: { value: string }) => f.value);

          // Log the search window for this topic
          const startTimeStr = searchStartTime.toLocaleTimeString('en-US');
          const endTimeStr = searchEndTime.toLocaleTimeString('en-US');
          this.logger.info(`Searching: ${numericTopicId} (${startTimeStr} - ${endTimeStr})`);

          const searchConfig: SearchQueryConfig = {
            type: 'structured',
            searchId: numericTopicId.toString(),
            accounts: userFilters,
            mentions: mentionFilters,
            keywords: keywordFilters,
            endTime: searchEndTime.toISOString(),
            startTime: searchStartTime.toISOString(),
            language: 'en',
            excludeRetweets: true,
            operator: 'OR'
          };

          const searchResults = await this.searchStrategy.searchWithPagination(searchConfig, 50);

          if (searchResults?.tweets) {
            for (const tweet of searchResults.tweets) {
              if (!tweet?.id) {
                this.logger.warn('❗ Invalid tweet data', undefined, { tweetData: tweet });
                continue;
              }
              
              const tweetDate = new Date(tweet.createdAt);
              const tweetAgeMinutes = (searchEndTime.getTime() - tweetDate.getTime()) / (60 * 1000);
              
              if (tweetAgeMinutes > this.initialWindowMinutes) {
                continue;
              }
              
              if (seenTweetIds.has(tweet.id)) {
                duplicateCount.total++;
                continue;
              }
              
              if (await this.storage.hasSeen(tweet.id, topicId)) {
                duplicateCount.byTopic++;
              } else {
                allTweets.push(tweet);
                seenTweetIds.add(tweet.id);
              }
            }
          }

          processedTopics.add(numericTopicId);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('❌ Error processing topic:', err, { topic: topicId });
          continue;
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Failed to get tweets:', err, {
        processedTopics: Array.from(processedTopics)
      });
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