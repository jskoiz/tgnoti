#!/usr/bin/env node
import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';
import { DatabaseManager } from '../src/core/storage/DatabaseManager.js';
import { MongoDBService } from '../src/services/MongoDBService.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { LoggingConfig } from '../src/config/loggingConfig.js';
import { MetricsManager } from '../src/core/monitoring/MetricsManager.js';
import path from 'path';

interface TopicFilterRecord {
  id: number;
  topic_id: number;
  filter_type: 'user' | 'mention' | 'keyword';
  value: string;
  created_at: string;
  created_by?: number;
}

interface TweetTrackingRecord {
  tweet_id: string;
  topic_id: string;
  timestamp: number;
}

async function migrateData() {
  // Set up DI container
  const container = new Container();
  container.bind<LoggingConfig>(TYPES.LoggingConfig).to(LoggingConfig).inSingletonScope();
  container.bind<Logger>(TYPES.Logger).to(ConsoleLogger).inSingletonScope();
  container.bind<ConfigService>(TYPES.ConfigService).to(ConfigService).inSingletonScope();
  container.bind<MetricsManager>(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
  container.bind<MongoDBService>(TYPES.MongoDBService).to(MongoDBService).inSingletonScope();
  container.bind<string>(TYPES.BasePath).toConstantValue(process.cwd());
  container.bind<DatabaseManager>(TYPES.DatabaseManager).to(DatabaseManager).inSingletonScope();
  
  const logger = container.get<Logger>(TYPES.Logger);
  logger.setComponent('MigrationScript');
  
  const sqliteDb = container.get<DatabaseManager>(TYPES.DatabaseManager);
  const mongoDb = container.get<MongoDBService>(TYPES.MongoDBService);
  
  try {
    logger.info('Starting migration from SQLite to MongoDB...');
    
    // Initialize both databases
    await sqliteDb.initialize();
    await mongoDb.initialize();
    
    // Migrate topic filters
    logger.info('Migrating topic filters...');
    const topicFilters = await sqliteDb.query<TopicFilterRecord>(`
      SELECT id, topic_id, filter_type, value, created_at, created_by
      FROM topic_filters
    `);
    
    let filterCount = 0;
    for (const filter of topicFilters) {
      await mongoDb.addTopicFilter(filter.topic_id, {
        type: filter.filter_type,
        value: filter.value
      }, filter.created_by);
      filterCount++;
      
      if (filterCount % 100 === 0) {
        logger.info(`Migrated ${filterCount}/${topicFilters.length} topic filters`);
      }
    }
    
    logger.info(`Migrated ${filterCount} topic filters`);
    
    // Migrate tweet tracking data
    logger.info('Migrating tweet tracking data...');
    try {
      const tweetTracking = await sqliteDb.query<TweetTrackingRecord>(`
        SELECT tweet_id, topic_id, timestamp
        FROM tracked_tweets
      `);
      
      let tweetCount = 0;
      for (const tweet of tweetTracking) {
        // Create a minimal tweet document for tracking purposes
        await mongoDb.saveTweet({
          id: tweet.tweet_id,
          text: '[Migrated from SQLite]',
          replyCount: 0,
          retweetCount: 0,
          likeCount: 0,
          viewCount: 0,
          createdAt: new Date(tweet.timestamp).toISOString(),
          tweetBy: {
            userName: 'migration',
            displayName: 'Migration',
            fullName: 'Migration System',
            followersCount: 0,
            followingCount: 0,
            statusesCount: 0,
            verified: false,
            isVerified: false,
            createdAt: new Date(tweet.timestamp).toISOString()
          }
        }, tweet.topic_id);
        tweetCount++;
        
        if (tweetCount % 1000 === 0) {
          logger.info(`Migrated ${tweetCount}/${tweetTracking.length} tweet tracking records`);
        }
      }
      
      logger.info(`Migrated ${tweetCount} tweet tracking records`);
    } catch (error) {
      logger.warn('Could not migrate tweet tracking data. This may be expected if using a different schema:', error);
    }
    
    logger.info('Migration completed successfully!');
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    // Close connections
    await sqliteDb.close();
    await mongoDb.close();
  }
}

migrateData().catch(error => {
  console.error('Unhandled error in migration script:', error);
  process.exit(1);
});