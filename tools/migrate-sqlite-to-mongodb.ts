#!/usr/bin/env node
import { Container } from 'inversify';
import { createContainer } from '../src/config/container.js';
import { MongoDBService } from '../src/services/MongoDBService.js';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { Config } from '../src/types/storage.js';

async function migrateData() {
  console.log('Starting migration from SQLite to MongoDB...');
  
  // Create a container with both SQLite and MongoDB dependencies
  const container = createContainer();
  
  // We need to manually create the DatabaseManager since it's removed from the container
  const logger = container.get<Logger>(TYPES.Logger);
  logger.setComponent('MigrationScript');
  
  const basePath = process.cwd();
  const dbPath = path.join(basePath, 'affiliate_data.db');
  
  // Check if SQLite database exists
  try {
    await fs.access(dbPath);
    logger.info(`SQLite database found at ${dbPath}`);
  } catch (error) {
    logger.error(`SQLite database not found at ${dbPath}. Migration cannot proceed.`);
    process.exit(1);
  }
  
  // Create a DatabaseManager instance manually
  const sqlite3 = await import('sqlite3');
  const db = new sqlite3.default.Database(dbPath);
  
  // Create a wrapper for the DatabaseManager's query method
  const query = <T>(sql: string, params: any[] = []): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) {
          logger.error('Database query failed', err);
          reject(err);
          return;
        }
        resolve(rows as T[]);
      });
    });
  };
  
  // Get MongoDB service
  const mongoDb = container.get<MongoDBService>(TYPES.MongoDBService);
  
  try {
    // Initialize MongoDB
    await mongoDb.initialize();
    logger.info('MongoDB initialized successfully');
    
    // 1. Migrate topic filters
    logger.info('Migrating topic filters...');
    const topicFilters = await query<{
      id: number;
      topic_id: number;
      filter_type: 'user' | 'mention' | 'keyword';
      value: string;
      created_at: string;
      created_by: number | null;
    }>('SELECT * FROM topic_filters');
    
    logger.info(`Found ${topicFilters.length} topic filters to migrate`);
    
    for (const filter of topicFilters) {
      try {
        await mongoDb.addTopicFilter(filter.topic_id, {
          type: filter.filter_type,
          value: filter.value
        }, filter.created_by || undefined);
        
        logger.debug(`Migrated filter: ${filter.filter_type}:${filter.value} for topic ${filter.topic_id}`);
      } catch (error) {
        logger.error(`Failed to migrate filter ${filter.id}:`, error);
      }
    }
    
    logger.info(`Migrated ${topicFilters.length} topic filters`);
    
    // 2. Migrate tracked tweets
    logger.info('Migrating tracked tweets...');
    const trackedTweets = await query<{
      tweet_id: string;
      topic_id: string;
      timestamp: number;
    }>('SELECT * FROM tracked_tweets');
    
    logger.info(`Found ${trackedTweets.length} tracked tweets to migrate`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const tweet of trackedTweets) {
      try {
        // Check if already in MongoDB
        if (!(await mongoDb.hasSeen(tweet.tweet_id, tweet.topic_id))) {
          await mongoDb.saveTweet({
            id: tweet.tweet_id,
            text: '[Migrated from SQLite]',
            replyCount: 0,
            retweetCount: 0,
            likeCount: 0,
            viewCount: 0,
            createdAt: new Date(tweet.timestamp).toISOString(),
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
          }, tweet.topic_id);
          migratedCount++;
          
          if (migratedCount % 100 === 0) {
            logger.info(`Migrated ${migratedCount} tweets so far...`);
          }
        } else {
          skippedCount++;
        }
      } catch (error) {
        logger.error(`Failed to migrate tweet ${tweet.tweet_id}:`, error);
      }
    }
    
    logger.info(`Migrated ${migratedCount} tracked tweets, skipped ${skippedCount} (already in MongoDB)`);
    
    // 3. Migrate configuration
    logger.info('Migrating configuration...');
    const configPath = path.join(basePath, 'config.json');
    
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent) as Config;
      
      // Get environment variables for sensitive data
      const bearerToken = process.env.BEARER_TOKEN || '';
      const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
      const groupId = process.env.TELEGRAM_GROUP_ID || '';
      
      // Add sensitive data to config
      config.twitter.bearerToken = bearerToken;
      config.telegram.botToken = botToken;
      config.telegram.groupId = groupId;
      
      // Save to MongoDB
      await mongoDb.saveConfig(config);
      logger.info('Configuration migrated successfully');
    } catch (error) {
      logger.error('Failed to migrate configuration:', error);
    }
    
    logger.info('Migration completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    // Close connections
    db.close();
    await mongoDb.close();
  }
}

// Run the migration
migrateData().catch(console.error);