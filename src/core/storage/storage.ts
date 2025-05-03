import { injectable, inject } from 'inversify';
import type { Config } from '../../types/storage.js';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { Tweet } from '../../types/twitter.js';
import { ConfigService } from '../../services/ConfigService.js';
import { MongoDBService } from '../../services/MongoDBService.js';
import { ConfigStorage } from './ConfigStorage.js';

@injectable()
export class Storage {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private configService: ConfigService,
    @inject(TYPES.MongoDBService) private mongoDb: MongoDBService,
    @inject(TYPES.ConfigStorage) private configStorage: ConfigStorage
  ) {
    this.logger.setComponent('Storage');
  }

  async verify(): Promise<void> {
    // No file verification needed, MongoDB handles this
    this.logger.info('Storage verification completed');
  }

  async getConfig(): Promise<Config> {
    return this.configStorage.getConfig();
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
      // If the tweet doesn't exist, create a minimal record
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
            id: 'system',
            userId: 'system',
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

  async isTweetProcessed(tweetId: string, topicId?: string): Promise<boolean> {
    return this.hasSeen(tweetId, topicId);
  }

  async markTweetAsProcessed(tweetId: string, topicId: string = 'default'): Promise<void> {
    await this.markSeen(tweetId, topicId);
  }

  async getUnanalyzedTweets(limit: number = 100): Promise<Tweet[]> {
    try {
      return this.mongoDb.getUnanalyzedTweets(limit);
    } catch (error) {
      this.logger.error('Failed to get unanalyzed tweets:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async updateTweetSentiment(tweetId: string, sentiment: any): Promise<void> {
    try {
      this.mongoDb.updateTweetSentiment(tweetId, sentiment);
    } catch (error) {
      this.logger.error('Failed to update tweet sentiment:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async cleanup(maxAge?: number): Promise<void> {
    try {
      const systemConfig = this.configService.getSystemConfig();
      await this.mongoDb.cleanup(maxAge || systemConfig.tweetCleanupAgeDays);
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