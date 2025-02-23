import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { TwitterClient } from '../src/twitter/twitterClient.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { ConfigManager } from '../src/config/ConfigManager.js';
import { CircuitBreaker } from '../src/utils/circuitBreaker.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import { RateLimitedQueue } from '../src/core/RateLimitedQueue.js';
import { RettiwtKeyManager } from '../src/twitter/rettiwtKeyManager.js';
import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface UserMonitorConfig {
  topicId: number;
  username: string;
}

class UserMonitor {
  private client!: TwitterClient;
  private searchBuilder!: RettiwtSearchBuilder;
  private lastProcessedIds: Map<number, string>;
  private logger: ConsoleLogger;

  constructor() {
    this.logger = new ConsoleLogger();
    this.lastProcessedIds = new Map();
  }

  async initialize(): Promise<void> {
    // Log startup information
    const container = new Container({ defaultScope: "Singleton" });
    
    // Core service bindings
    container.bind(TYPES.Logger).toConstantValue(this.logger);
    
    const configManager = new ConfigManager(this.logger);
    container.bind(TYPES.ConfigManager).toConstantValue(configManager);
    configManager.initialize();
    
    const circuitBreaker = new CircuitBreaker(this.logger, 5, 30000, 5000);
    container.bind(TYPES.CircuitBreaker).toConstantValue(circuitBreaker);
    
    const metricsManager = new MetricsManager(this.logger);
    container.bind(TYPES.MetricsManager).toConstantValue(metricsManager);
    
    const errorHandler = new ErrorHandler(this.logger, metricsManager);
    container.bind(TYPES.ErrorHandler).toConstantValue(errorHandler);
    
    const rateLimitedQueue = new RateLimitedQueue(this.logger, metricsManager);
    await rateLimitedQueue.initialize();
    container.bind(TYPES.RateLimitedQueue).toConstantValue(rateLimitedQueue);
    
    const keyManager = new RettiwtKeyManager(this.logger, configManager);
    container.bind(TYPES.RettiwtKeyManager).toConstantValue(keyManager);
    
    this.searchBuilder = new RettiwtSearchBuilder(this.logger, metricsManager, errorHandler);
    container.bind(TYPES.RettiwtSearchBuilder).toConstantValue(this.searchBuilder);
    
    // Create TwitterClient with all dependencies
    this.client = new TwitterClient(
      this.logger,
      circuitBreaker,
      metricsManager,
      configManager,
      keyManager,
      rateLimitedQueue
    );
    
    await this.client.initialize();
  }

  async monitorUsers(configs: UserMonitorConfig[], interval: number = 60000): Promise<void> {
    console.log('Starting user monitoring for:');
    configs.forEach(config => {
      console.log(`Topic ${config.topicId}: @${config.username}`);
    });
    console.log(`Checking every ${interval/1000} seconds...`);

    // Calculate start time (5 days ago)
    const startTime = new Date();
    startTime.setDate(startTime.getDate() - 5);

    while (true) {
      try {
        for (const config of configs) {
          await this.checkUserActivity(config, startTime);
        }
        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('Monitoring error:', error);
        await new Promise(resolve => setTimeout(resolve, interval * 2)); // Double the delay on error
      }
    }
  }

  private async checkUserActivity(config: UserMonitorConfig, startTime: Date): Promise<void> {
    const filter = this.searchBuilder.buildFilter({
      type: 'structured' as const,
      keywords: [`from:${config.username}`, `@${config.username}`],
      language: 'en',
      startTime: this.lastProcessedIds.get(config.topicId) ? undefined : startTime.toISOString()
    });

    const tweets = await this.client.searchTweets(filter);
    
    if (tweets.length > 0) {
      console.log(`\nFound ${tweets.length} new tweets for Topic ${config.topicId} (@${config.username}) at ${new Date().toLocaleString()}:`);
      for (const tweet of tweets) {
        await this.processTweet(tweet, config);
        this.lastProcessedIds.set(config.topicId, tweet.id);
      }
    }
  }

  private async processTweet(tweet: any, config: UserMonitorConfig): Promise<void> {
    const timestamp = new Date(tweet.createdAt);
    const formattedDate = timestamp.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    console.log(`\n[Topic ${config.topicId}] [${formattedDate}] @${tweet.tweetBy.userName} (${tweet.tweetBy.fullName})`);
    console.log(`Followers: ${tweet.tweetBy.followersCount.toLocaleString()} | Following: ${tweet.tweetBy.followingCount.toLocaleString()}`);
    
    console.log('\nContent:', tweet.text);
    
    console.log('\nEngagement:');
    console.log(`🔁 ${tweet.retweetCount.toLocaleString()} Retweets`);
    console.log(`💬 ${tweet.replyCount.toLocaleString()} Replies`);
    console.log(`❤️ ${tweet.likeCount.toLocaleString()} Likes`);
    console.log(`👁️ ${tweet.viewCount.toLocaleString()} Views`);
    
    if (tweet.quotedTweet) {
      console.log('\nQuoted Tweet:');
      console.log(`@${tweet.quotedTweet.tweetBy.userName}: ${tweet.quotedTweet.text}`);
    }
    
    if (tweet.media?.length) {
      console.log('\nMedia:');
      tweet.media.forEach((m: any, index: number) => {
        console.log(`${index + 1}. Type: ${m.type}, URL: ${m.url}`);
      });
    }
    
    if (tweet.entities?.hashtags?.length) {
      console.log('\nHashtags:', tweet.entities.hashtags.join(', '));
    }
    
    if (tweet.entities?.urls?.length) {
      console.log('\nURLs:', tweet.entities.urls.join(', '));
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

// Configuration for the three topics
const monitorConfigs: UserMonitorConfig[] = [
  { topicId: 5572, username: 'tradewithPhoton' },
  { topicId: 5573, username: 'bullx_io' },
  { topicId: 5574, username: 'TradeonNova' }
];

// Start monitoring
const monitor = new UserMonitor();
monitor.initialize()
  .then(() => monitor.monitorUsers(monitorConfigs))
  .catch(error => console.error('Fatal error:', error));