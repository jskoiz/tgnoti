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
    this.logger.debug('Initialized TweetMonitor with configuration', {
      overlapBufferMinutes: this.searchConfig.getOverlapBufferMinutes(),
      initialWindowMinutes: this.initialWindowMinutes,
      topicDelayMs: this.topicDelayMs
    });
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
    this.logger.info(`Starting tweet monitor with ${intervalMs}ms interval and initial startup delay`);

    this.monitoringInterval = setInterval(async () => {
      try {
        // Add a staggered startup delay to prevent immediate rate limiting
        if (this.initialStartupDelay) {
          this.initialStartupDelay = false;
          const startupDelay = Math.floor(Math.random() * 120 + 60) * 1000; // 60-180 second random delay
          this.logger.info(`Applying initial startup delay of ${startupDelay}ms before first check`);
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
      // Log search window strategy at the start of check
      if (this.lastPollTime) {
        this.currentSearchStartTime = new Date(this.lastPollTime.getTime() - this.overlapBufferMs);
        this.logger.info('🔍 Tweet check - Sliding window', {
          lastPollTime: this.lastPollTime.toISOString(),
          startTime: this.currentSearchStartTime.toISOString(),
          overlapBuffer: `${this.overlapBufferMs / 1000} seconds`,
          windowSize: `${(Date.now() - this.currentSearchStartTime.getTime()) / 1000} seconds`,
          endTime: new Date().toISOString(),
          description: `Sliding window with ${this.overlapBufferMs / 1000}-second overlap`
        });
      } else {
        this.currentSearchStartTime = new Date(Date.now() - (this.initialWindowMinutes * 60 * 1000));
        this.logger.info('🔍 Tweet check - Initial window', { 
          startTime: this.currentSearchStartTime.toISOString(),
          endTime: new Date().toISOString(),
          windowSize: `${this.initialWindowMinutes} minute(s)`,
          description: `First scan using ${this.initialWindowMinutes}-minute window`
        });
      }
      
      const tweets = await this.getTweets();
      this.lastPollTime = new Date(); // Update last poll time after successful check
      
      if (tweets.length > 0) {
        this.logger.info(`✨ Found ${tweets.length} new tweets`);
        this.metrics.increment('monitor.checks');
        this.metrics.increment('monitor.tweets.found', tweets.length);
      }

    } catch (error) {
      this.metrics.increment('monitor.errors');
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Tweet check failed:', err, {
        stack: error instanceof Error ? error.stack : undefined
      });

      throw error;
    }
  }

  private async getTweets(): Promise<Tweet[]> {
    const allTweets: Tweet[] = [];
    const seenTweetIds = new Set<string>();
    let duplicateCount = { total: 0, byTopic: 0 };
    const processedTopics = new Set<number>();

    try {
      // Get all topics with filters
      const config = await this.storage.getConfig();
      const topics = config.telegram.topicIds || {};
      
      // Debug log the loaded topics
      this.logger.info('📋 Loaded topics configuration:', {
        topics: Object.entries(topics).map(([id, details]) => ({ id }))
      });
      
      const topicIds = Object.keys(topics);
      
      this.logger.info(`🔄 Processing ${topicIds.length} topics with a ${this.topicDelayMs}ms delay between each`);

      for (let i = 0; i < topicIds.length; i++) {
        const topicId = topicIds[i];
        const numericTopicId = parseInt(topicId);
        
        if (isNaN(numericTopicId)) {
          this.logger.warn(
            '⚠️ Invalid topic ID format',
            new Error(`Invalid topic ID: ${topicId} (${typeof topicId})`)
          );
          continue;
        }
        if (processedTopics.has(numericTopicId)) continue;

        // Add progressive delay between topics to avoid rate limiting
        if (i > 0) {
          const baseDelay = this.topicDelayMs;
          const progressiveFactor = Math.min(2, 1 + (i * 0.1)); // Increase delay by up to 2x based on position
          const jitter = Math.random() * 10000; // Add 0-10s random jitter
          const actualDelay = Math.floor(baseDelay * progressiveFactor + jitter);
          
          this.logger.debug(`Waiting ${actualDelay}ms before processing next topic (base: ${baseDelay}ms, factor: ${progressiveFactor})`);
          await new Promise(resolve => setTimeout(resolve, actualDelay));
        }

        try {
          // Get filters for this topic
          const filters = await this.topicFilterManager.getFilters(numericTopicId);
          if (!filters.length) {
            this.logger.warn(
              '⚠️ No filters configured for topic',
              new Error(`Topic ${numericTopicId} has no filters configured`)
            );
            continue;
          }

          // Group filters by type
          const userFilters = filters.filter((f: { type: string }) => f.type === 'user').map((f: { value: string }) => f.value);
          const mentionFilters = filters.filter((f: { type: string }) => f.type === 'mention').map((f: { value: string }) => f.value);
          const keywordFilters = filters.filter((f: { type: string }) => f.type === 'keyword').map((f: { value: string }) => f.value);

          // Calculate search window
          if (!this.currentSearchStartTime) {
            throw new Error('Search start time not initialized');
          }
          
          const searchStartTime = this.currentSearchStartTime;
          const searchEndTime = new Date();

          // Build search query
          const searchConfig: SearchQueryConfig = {
            type: 'structured',
            accounts: userFilters,
            mentions: mentionFilters,
            keywords: keywordFilters,
            endTime: searchEndTime.toISOString(),
            startTime: searchStartTime.toISOString(),
            language: 'en',
            excludeRetweets: true,
            operator: 'OR'
          };

          // Execute search
          const searchResults = await this.searchStrategy.searchWithPagination(searchConfig, 50); // Reduce batch size

          // Process tweets
          if (searchResults?.tweets) {
            for (const tweet of searchResults.tweets) {
              if (!tweet?.id) {
                this.logger.warn('❗ Received invalid tweet', undefined, { tweetData: tweet });
                continue;
              }
              
              // Add filter for tweet age - only accept tweets that are actually within our search window
              const tweetDate = new Date(tweet.createdAt);
              const now = new Date();
              const tweetAgeMinutes = (searchEndTime.getTime() - tweetDate.getTime()) / (60 * 1000);
              const configuredWindow = this.initialWindowMinutes;
              
              // Enforce a strict time window check
              if (tweetAgeMinutes > configuredWindow) {
                this.logger.info('⚠️ Tweet too old for configured window, skipping', {
                  tweetAgeMinutes: tweetAgeMinutes.toFixed(2),
                  configuredWindow,
                  tweetId: tweet.id
                });
                continue;
              }
              
              this.logger.debug('Tweet age analysis', {
                tweetId: tweet.id,
                tweetDate: tweetDate.toISOString(),
                searchStartTime: this.currentSearchStartTime.toISOString(),
                searchEndTime: searchEndTime.toISOString(),
                tweetAgeMinutes: tweetAgeMinutes.toFixed(2),
                windowSizeMinutes: ((searchEndTime.getTime() - this.currentSearchStartTime.getTime()) / (60 * 1000)).toFixed(2),
                configuredWindow
              });
              
              
              // Check if we've seen this tweet in the current batch
              if (seenTweetIds.has(tweet.id)) {
                duplicateCount.total++;
                this.logger.debug('Duplicate tweet found in current batch', {
                  tweetId: tweet.id,
                  topicId
                });
                continue;
              }
              
              // Check if we've seen this tweet in storage
              if (await this.storage.hasSeen(tweet.id, topicId)) {
                duplicateCount.byTopic++;
              } else {
                allTweets.push(tweet);
              }
            }
          } else {
            this.logger.warn('❗ Search returned no tweets for topic', undefined, {
              topic: topicId,
              searchConfig: {
                accounts: searchConfig.accounts,
                mentions: searchConfig.mentions, 
                keywords: searchConfig.keywords,
                startTime: searchConfig.startTime
              }
            });
          }

          processedTopics.add(numericTopicId);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('❌ Error processing topic:', err, {
            topic: topicId,
            stack: error instanceof Error ? error.stack : undefined
          });
          continue; // Continue with next topic even if one fails
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('❌ Failed to get tweets:', err, {
        stack: error instanceof Error ? error.stack : undefined,
        processedTopics: Array.from(processedTopics),
        timestamp: new Date().toISOString()
      });
      throw error;
    }

    // Log summary at the end
    this.logger.info('📊 Processing cycle summary', { 
      stats: {
        processedTopics: processedTopics.size,
        uniqueTweets: allTweets.length,
        duplicatesInBatch: duplicateCount.total,
        duplicatesInStorage: duplicateCount.byTopic,
        totalProcessed: allTweets.length + duplicateCount.total + duplicateCount.byTopic
      }
    });
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