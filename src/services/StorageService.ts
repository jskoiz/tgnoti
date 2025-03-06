import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { MongoDBService } from './MongoDBService.js';
import { Tweet } from '../types/twitter.js';
import { MonitorState, MetricsSnapshot } from '../types/monitoring-enhanced.js';
import { Config } from '../types/storage.js';

@injectable()
export class StorageService {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private configService: ConfigService,
    @inject(TYPES.MongoDBService) private mongoDb: MongoDBService
  ) {
    this.logger.setComponent('StorageService');
  }
  
  async initialize(): Promise<void> {
    try {
      await this.mongoDb.initialize();
      this.logger.info('Storage service initialized');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize MongoDB service. Application cannot continue without database connection:', err);
      // Rethrow the error to stop the application
      throw err;
    }
  }
  
  async getConfig(): Promise<Config | null> {
    try {
      return await this.mongoDb.getConfig();
    } catch (error) {
      this.logger.error('Failed to get configuration:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async saveConfig(config: Config): Promise<void> {
    try {
      await this.mongoDb.saveConfig(config);
      this.logger.debug('Configuration saved successfully');
    } catch (error) {
      this.logger.error('Failed to save configuration:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async storeTweet(tweet: Tweet, topicId: string): Promise<void> {
    try {
      await this.mongoDb.saveTweet(tweet, topicId);
      this.logger.debug('Tweet stored successfully', { tweetId: tweet.id, topicId });
    } catch (error) {
      this.logger.error('Failed to store tweet:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async hasSeen(tweetId: string, topicId?: string): Promise<boolean> {
    try {
      const result = await this.mongoDb.hasSeen(tweetId, topicId);
      this.logger.debug(`Duplicate check for tweet ${tweetId}`, {
        topicId,
        result
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to check if tweet has been seen:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async markSeen(tweetId: string, topicId: string): Promise<void> {
    try {
      // For backward compatibility, we'll check if the tweet exists
      if (!(await this.hasSeen(tweetId, topicId))) {
        await this.storeTweet({
          id: tweetId,
          text: '[Marked as seen]',
          replyCount: 0,
          retweetCount: 0,
          likeCount: 0,
          viewCount: 0,
          createdAt: new Date().toISOString(),
          tweetBy: {
            userName: 'system',
            displayName: 'System',
            fullName: 'System',
            followersCount: 0,
            followingCount: 0,
            statusesCount: 0,
            verified: false,
            isVerified: false,
            createdAt: new Date().toISOString()
          }
        }, topicId);
      }
    } catch (error) {
      this.logger.error('Failed to mark tweet as seen:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // Alias for hasSeen to match new event-based system naming
  async isTweetProcessed(tweetId: string, topicId?: string): Promise<boolean> {
    return this.hasSeen(tweetId, topicId);
  }
  
  // Alias for markSeen to match new event-based system naming
  async markTweetAsProcessed(tweetId: string, topicId: string = 'default'): Promise<void> {
    await this.markSeen(tweetId, topicId);
  }
  
  async getUnanalyzedTweets(limit: number = 100): Promise<Tweet[]> {
    try {
      return await this.mongoDb.getUnanalyzedTweets(limit);
    } catch (error) {
      this.logger.error('Failed to get unanalyzed tweets:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async updateTweetSentiment(tweetId: string, sentiment: any): Promise<void> {
    try {
      await this.mongoDb.updateTweetSentiment(tweetId, sentiment);
    } catch (error) {
      this.logger.error('Failed to update tweet sentiment:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getMonitorState(): Promise<MonitorState | null> {
    try {
      try {
        return await this.mongoDb.getMonitorState();
      } catch (error) {
        this.logger.warn('Failed to get monitor state from MongoDB, returning null');
        return null;
      }
      
    } catch (error) {
      this.logger.error('Failed to get monitor state:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async saveMonitorState(state: MonitorState): Promise<void> {
    try {
      try {
        await this.mongoDb.saveMonitorState(state);
      } catch (error) {
        this.logger.warn('Failed to save monitor state to MongoDB, continuing without persistence');
        return;
      }
      
      this.logger.debug('Monitor state saved successfully');
    } catch (error) {
      this.logger.error('Failed to save monitor state:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async saveMetricsSnapshot(snapshot: MetricsSnapshot): Promise<void> {
    try {
      try {
        await this.mongoDb.saveMetricsSnapshot(snapshot);
      } catch (error) {
        this.logger.warn('Failed to save metrics snapshot to MongoDB, continuing without persistence');
        return;
      }
      
      this.logger.debug('Metrics snapshot saved successfully');
    } catch (error) {
      this.logger.error('Failed to save metrics snapshot:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getHistoricalMetrics(limit: number = 100): Promise<MetricsSnapshot[]> {
    try {
      try {
        return await this.mongoDb.getHistoricalMetrics(limit);
      } catch (error) {
        this.logger.warn('Failed to get historical metrics from MongoDB, returning empty array');
        return [];
      }
      
    } catch (error) {
      this.logger.error('Failed to get historical metrics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async cleanup(maxAge?: number): Promise<void> {
    try {
      const systemConfig = this.configService.getSystemConfig();
      try {
        await this.mongoDb.cleanup(maxAge || systemConfig.tweetCleanupAgeDays);
      } catch (error) {
        this.logger.warn('Failed to cleanup MongoDB, continuing without cleanup');
        return;
      }
      
      this.logger.debug('Storage cleanup completed successfully');
    } catch (error) {
      this.logger.error('Failed to cleanup storage:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async close(): Promise<void> {
    try {
      await this.mongoDb.close();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('Failed to close MongoDB connection:', err);
      // Continue with shutdown even if MongoDB close fails
    }
  }
}