import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { TwitterService } from '../services/TwitterService.js';
import { TweetProcessor } from '../services/TweetProcessor.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';

@injectable()
export class TweetMonitor {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastPollTime: Date | null = null;
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.TwitterService) private twitter: TwitterService,
    @inject(TYPES.TweetProcessor) private processor: TweetProcessor,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('TweetMonitor');
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Tweet monitor is already running');
      return;
    }
    
    const twitterConfig = this.config.getTwitterConfig();
    const pollingInterval = twitterConfig.rateLimit.pollingIntervalMs;
    
    this.isRunning = true;
    this.logger.info(`Starting tweet monitor with ${pollingInterval}ms interval`);
    
    // Initial run with a small delay to allow system initialization
    setTimeout(() => this.run(), 5000);
    
    // Set up interval
    this.monitoringInterval = setInterval(() => {
      try {
        this.run();
      } catch (error) {
        this.logger.error('Error in monitoring cycle:', error instanceof Error ? error : new Error(String(error)));
      }
    }, pollingInterval);
  }
  
  async run(): Promise<void> {
    const startTime = Date.now();
    this.metrics.increment('monitor.cycles');
    
    try {
      const topics = this.config.getTopics();
      let totalTweets = 0;
      let processedTweets = 0;
      
      // Calculate search window
      let searchStartTime: Date;
      if (this.lastPollTime) {
        const twitterConfig = this.config.getTwitterConfig();
        const overlapMs = twitterConfig.searchWindow.overlapBufferMinutes * 60 * 1000;
        searchStartTime = new Date(this.lastPollTime.getTime() - overlapMs);
      } else {
        const defaultWindowMinutes = this.config.getTwitterConfig().searchWindow.windowMinutes;
        searchStartTime = new Date(Date.now() - (defaultWindowMinutes * 60 * 1000));
      }
      
      const searchEndTime = new Date();
      
      this.logger.info(`Search cycle: ${searchStartTime.toISOString()} to ${searchEndTime.toISOString()}`);
      
      for (const topic of topics) {
        // Add delay between topics to respect rate limits
        const twitterConfig = this.config.getTwitterConfig();
        const topicDelay = twitterConfig.rateLimit.topicDelayMs;
        if (totalTweets > 0) {
          await new Promise(resolve => setTimeout(resolve, topicDelay));
        }
        
        this.logger.info(`Processing topic ${topic.name} (ID: ${topic.id})`);
        
        // Calculate topic-specific search window if defined
        const topicSearchStartTime = topic.searchWindowMinutes 
          ? new Date(Date.now() - (topic.searchWindowMinutes * 60 * 1000))
          : searchStartTime;
        
        for (const account of topic.accounts) {
          try {
            // Add delay between accounts to respect rate limits
            const accountDelay = 1000 / twitterConfig.rateLimit.requestsPerSecond;
            if (totalTweets > 0) {
              await new Promise(resolve => setTimeout(resolve, accountDelay));
            }
            
            this.logger.debug(`Searching tweets for account: ${account}`);
            const tweets = await this.twitter.searchTweets(account, topicSearchStartTime);
            
            // Only log at INFO level if tweets were found
            if (tweets.length > 0) {
              this.logger.info(`Found ${tweets.length} tweets for account ${account}`);
            } else {
              this.logger.debug(`Found ${tweets.length} tweets for account ${account}`);
            }
            totalTweets += tweets.length;
            
            // Process tweets in batches and log summary instead of individual tweets
            let processedCount = 0;
            for (const tweet of tweets) {
              const processed = await this.processor.processTweet(tweet, topic);
              if (processed) {
                processedTweets++;
                processedCount++;
              }
            }
            
            // Log summary of processed tweets for this account if any were found
            if (tweets.length > 0) {
              this.logger.info(`Processed ${processedCount} of ${tweets.length} tweets for account ${account}`);
            }
          } catch (error) {
            this.logger.error(`Error processing account ${account}:`, error instanceof Error ? error : new Error(String(error)));
            this.metrics.increment('monitor.account_errors');
            // Continue with next account
          }
        }
      }
      
      this.lastPollTime = new Date();
      const duration = Date.now() - startTime;
      
      this.logger.info(`Search cycle complete: ${totalTweets} tweets found, ${processedTweets} processed in ${duration}ms`);
      this.metrics.timing('monitor.cycle_duration', duration);
      this.metrics.gauge('monitor.tweets_found', totalTweets);
      this.metrics.gauge('monitor.tweets_processed', processedTweets);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Error in monitoring run:', error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('monitor.cycle_errors');
      this.metrics.timing('monitor.error_duration', duration);
    }
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
}