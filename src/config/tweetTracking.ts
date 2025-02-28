import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { Environment } from './environment.js';
import { DatabaseManager } from '../core/storage/DatabaseManager.js';

interface TrackedTweet {
  id: string;
  topicId: string;
  timestamp: number;
}

interface QueryResult {
  tweet_id: string;
  topic_id: string;
}

@injectable()
export class TweetTrackingConfig {
  private readonly tableName = 'tracked_tweets';
  private readonly defaultCleanupAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.DatabaseManager) private db: DatabaseManager,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.Environment) private environment: Environment
  ) {}

  async initialize(): Promise<void> {
    try {
      // Create table if it doesn't exist
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          tweet_id TEXT NOT NULL,
          topic_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          PRIMARY KEY (tweet_id, topic_id)
        )
      `);

      // Create index on timestamp for cleanup
      await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_timestamp 
        ON ${this.tableName}(timestamp)
      `);

      this.logger.info('Tweet tracking table initialized');
    } catch (error) {
      this.logger.error('Failed to initialize tweet tracking:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async hasSeen(tweetId: string, topicId: string): Promise<boolean> {
    try {
      const results = await this.db.query<QueryResult>(
        `SELECT 1 FROM ${this.tableName} 
         WHERE tweet_id = ? AND topic_id = ?`,
        [tweetId, topicId]
      );
      return results.length > 0;
    } catch (error) {
      this.logger.error('Failed to check tweet status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async markSeen(tweetId: string, topicId: string): Promise<void> {
    try {
      await this.db.run(
        `INSERT OR REPLACE INTO ${this.tableName} 
         (tweet_id, topic_id, timestamp) 
         VALUES (?, ?, ?)`,
        [tweetId, topicId, Date.now()]
      );
    } catch (error) {
      this.logger.error('Failed to mark tweet as seen:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async cleanup(maxAgeMs?: number): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Use provided maxAge or get from environment or use default
      const cleanupAge = maxAgeMs || this.getCleanupAgeFromEnv();
      const cutoff = Date.now() - cleanupAge;
      
      // Get count before cleanup
      const beforeCount = await this.getTweetCount();
      
      // Perform cleanup
      await this.db.run(
        `DELETE FROM ${this.tableName} WHERE timestamp < ?`,
        [cutoff]
      );
      
      // Get count after cleanup
      const afterCount = await this.getTweetCount();
      const cleanedCount = beforeCount - afterCount;
      
      // Record metrics
      this.metrics.gauge('storage.tweets_count', afterCount);
      this.metrics.increment('storage.tweets_cleaned', cleanedCount);
      this.metrics.timing('storage.cleanup_duration', Date.now() - startTime);
      
      // Log results
      this.logger.info(`Cleaned up ${cleanedCount} tweets older than ${cleanupAge}ms`);
    } catch (error) {
      this.metrics.increment('storage.cleanup_failures');
      this.logger.error('Failed to cleanup old tweets:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async reset(): Promise<void> {
    try {
      await this.db.run(`DELETE FROM ${this.tableName}`);
      this.logger.info('Tweet tracking reset');
    } catch (error) {
      this.logger.error('Failed to reset tweet tracking:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  private getCleanupAgeFromEnv(): number {
    // Try to get from environment variable, fall back to default
    const config = this.environment.getConfig();
    const days = config.storage.cleanupAgeDays;
    if (days > 0) return days * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    return this.defaultCleanupAge;
  }
  
  private async getTweetCount(): Promise<number> {
    const result = await this.db.query<{count: number}>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`);
    return result[0]?.count || 0;
  }
}