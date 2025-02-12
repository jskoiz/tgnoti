import { injectable, inject } from 'inversify';
import fs from 'fs/promises';
import path from 'path';
import { Config, SeenTweet } from '../types/storage.js';
import { Logger } from '../types/logger.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TYPES } from '../types/di.js';

@injectable()
export class Storage {
  private lastTweetIdPath: string;
  private seenTweetsPath: string;
  private configPath: string;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager,
    @inject(TYPES.BasePath) basePath: string
  ) {
    this.lastTweetIdPath = path.join(basePath, 'lastTweetId.json');
    this.seenTweetsPath = path.join(basePath, 'seenTweets.json');
    this.configPath = path.join(basePath, 'config.json');
  }

  async verify(): Promise<void> {
    // Check if all required files exist and are accessible
    const files = [
      { path: this.configPath, name: 'config.json', template: { 
        twitter: { searchQueries: {}, pollingInterval: 60000 },
        telegram: { defaultTopicId: 'default', retryAttempts: 3 }
      }},
      { path: this.lastTweetIdPath, name: 'lastTweetId.json', template: { topics: {} } },
      { path: this.seenTweetsPath, name: 'seenTweets.json', template: { tweets: {} } }
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

      config.telegram = {
        ...config.telegram,
        botToken,
        groupId,
        retryAttempts: config.telegram.retryAttempts || 3,
        defaultTopicId: config.telegram.defaultTopicId || 'default'
      };

      return config;
    } catch (error) {
      this.logger.error('Failed to get configuration', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async getLastTweetId(topicId: string): Promise<string> {
    try {
      const content = await fs.readFile(this.lastTweetIdPath, 'utf-8');
      const data = JSON.parse(content);
      return data.topics[topicId]?.lastId || '';
    } catch (error) {
      this.logger.error(`Failed to get last tweet ID for topic ${topicId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async updateLastTweetId(topicId: string, tweetId: string): Promise<void> {
    try {
      const content = await fs.readFile(this.lastTweetIdPath, 'utf-8');
      const data = JSON.parse(content);
      
      if (!data.topics[topicId]) {
        data.topics[topicId] = {
          lastId: '',
          lastUpdate: 0
        };
      }

      data.topics[topicId].lastId = tweetId;
      data.topics[topicId].lastUpdate = Date.now();

      await fs.writeFile(this.lastTweetIdPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error(`Failed to update last tweet ID for topic ${topicId}`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async hasSeen(tweetId: string, topicId?: string): Promise<boolean> {
    try {
      const content = await fs.readFile(this.seenTweetsPath, 'utf-8');
      const data = JSON.parse(content) as { tweets: { [key: string]: SeenTweet } };
      const tweet = data.tweets[tweetId];

      // If tweet hasn't been seen at all, return false
      if (!tweet) {
        return false;
      }

      // If no topicId provided, just check if tweet exists
      if (!topicId) {
        return true;
      }

      // Check if tweet has been processed for this topic
      return tweet.topicIds.includes(topicId);
    } catch (error) {
      this.logger.error(`Failed to check if tweet ${tweetId} was seen`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async markSeen(tweetId: string, topicId: string): Promise<void> {
    try {
      const content = await fs.readFile(this.seenTweetsPath, 'utf-8');
      const data = JSON.parse(content) as { tweets: { [key: string]: SeenTweet } };

      if (!data.tweets[tweetId]) {
        data.tweets[tweetId] = {
          topicIds: [],
          processed: false,
          timestamp: Date.now()
        };
      }

      if (!data.tweets[tweetId].topicIds.includes(topicId)) {
        data.tweets[tweetId].topicIds.push(topicId);
      }
      data.tweets[tweetId].processed = true;

      await fs.writeFile(this.seenTweetsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error(`Failed to mark tweet ${tweetId} as seen`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      // Clean up seen tweets older than maxAge (default 7 days)
      const content = await fs.readFile(this.seenTweetsPath, 'utf-8');
      const data = JSON.parse(content) as { tweets: { [key: string]: SeenTweet } };
      const now = Date.now();

      const newTweets: { [key: string]: SeenTweet } = {};
      for (const [tweetId, tweet] of Object.entries<SeenTweet>(data.tweets)) {
        if (now - tweet.timestamp < maxAge) {
          newTweets[tweetId] = tweet;
        }
      }

      data.tweets = newTweets;
      await fs.writeFile(this.seenTweetsPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.error('Failed to cleanup seen tweets', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}