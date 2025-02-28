import { injectable, inject } from 'inversify';
import fs from 'fs/promises';
import path from 'path';
import type { Config } from '../../types/storage.js';
import { Logger } from '../../types/logger.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { TYPES } from '../../types/di.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { TweetTrackingConfig } from '../../config/tweetTracking.js';
import { MongoDBManager } from './MongoDBManager.js';
import { Tweet } from '../../types/twitter.js';

@injectable()
export class Storage {
  private configPath: string;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager,
    @inject(TYPES.BasePath) basePath: string,
    @inject(TYPES.TweetTrackingConfig) private tweetTracking: TweetTrackingConfig,
    @inject(TYPES.MongoDBManager) private mongoDb: MongoDBManager
  ) {
    this.configPath = path.join(basePath, 'config.json');
    this.logger.setComponent('Storage');
  }

  async verify(): Promise<void> {
    // Check if all required files exist and are accessible
    const files = [
      { path: this.configPath, name: 'config.json', template: { 
        twitter: { searchQueries: {}, pollingInterval: 60000 },
        telegram: { defaultTopicId: 'default', retryAttempts: 3 }
      }}
    ];

    for (const file of files) {
      try {
        await fs.access(file.path);
      } catch (error) {
        this.logger.info(`Creating ${file.name} with default template`);
        await fs.writeFile(file.path, JSON.stringify(file.template, null, 2));
      }

      // Verify file is valid JSON
      try {
        const content = await fs.readFile(file.path, 'utf-8');
        JSON.parse(content);
      } catch (error) {
        const err = new Error(`Invalid JSON in ${file.name}`);
        this.logger.error('File validation failed', err);
        throw err;
      }
    }
  }

  private async getEnvironmentConfig(): Promise<{ bearerToken: string; botToken: string; groupId: string }> {
    try {
      const bearerToken = this.configManager.getEnvConfig<string>('BEARER_TOKEN');
      const botToken = this.configManager.getEnvConfig<string>('TELEGRAM_BOT_TOKEN');
      const groupId = this.configManager.getEnvConfig<string>('TELEGRAM_GROUP_ID');
      
      return { bearerToken, botToken, groupId };
    } catch (error) {
      this.logger.error('Failed to get environment configuration', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async getConfig(): Promise<Config> {
    try {
      // Read base configuration from file
      const content = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content) as Config;

      // Get sensitive data from environment
      const { bearerToken, botToken, groupId } = await this.getEnvironmentConfig();

      // Override sensitive configuration with environment variables
      config.twitter = {
        ...config.twitter,
        bearerToken
      };

      // Log detailed topic configuration
      this.logger.info('📋 Topic Configuration:', {
        topics: Object.entries(config.telegram.topicIds || {}).map(([name, id]) => ({
          name,
          id
        })),
        defaultTopicId: config.telegram.defaultTopicId,
        totalTopics: Object.keys(config.telegram.topicIds || {}).length
      });

      config.telegram = {
        ...config.telegram,
        botToken,
        groupId,
        retryAttempts: config.telegram.retryAttempts || 3,
        defaultTopicId: config.telegram.defaultTopicId || 'default',
        // Map topicIds to topics format
        topics: {
          ...(config.telegram.topics || {}),
          ...Object.entries(config.telegram.topicIds || {}).reduce((acc, [name, id]) => ({
            ...acc, [id]: { name }
          }), {})
        }
      };

      return config;
    } catch (error) {
      this.logger.error('Failed to get configuration', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async storeTweet(tweet: Tweet, topicId: string): Promise<void> {
    try {
      // Store complete tweet data in MongoDB
      await this.mongoDb.saveTweet({
        ...tweet,
        metadata: {
          source: 'twitter_api',
          topicId,
          capturedAt: new Date(),
          version: 1
        },
        processingStatus: {
          isAnalyzed: false,
          attempts: 0
        }
      });

      // Mark as seen in SQLite for backward compatibility
      await this.markSeen(tweet.id, topicId);

      this.logger.debug('Tweet stored successfully', { tweetId: tweet.id, topicId });
    } catch (error) {
      this.logger.error('Failed to store tweet:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async hasSeen(tweetId: string, topicId?: string): Promise<boolean> {
    const mongoTweet = await this.mongoDb.getTweet(tweetId);
    return mongoTweet !== null || await this.tweetTracking.hasSeen(tweetId, topicId || '');
  }

  async markSeen(tweetId: string, topicId: string): Promise<void> {
    await this.tweetTracking.markSeen(tweetId, topicId);
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

  // Cleanup old data without closing connections
  async cleanup(maxAge?: number): Promise<void> {
    try {
      // Only cleanup old data, don't close connections
      await this.tweetTracking.cleanup(maxAge);
      this.logger.debug('Storage cleanup completed successfully');
    } catch (error) {
      this.logger.error('Failed to cleanup storage:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}