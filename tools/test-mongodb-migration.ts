#!/usr/bin/env node
import { Container } from 'inversify';
import { createContainer } from '../src/config/container.js';
import { MongoDBService } from '../src/services/MongoDBService.js';
import { StorageService } from '../src/services/StorageService.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';

async function testMongoDB() {
  console.log('Testing MongoDB migration...');
  
  // Create a container with MongoDB dependencies
  const container = createContainer();
  
  // Get services
  const logger = container.get<Logger>(TYPES.Logger);
  logger.setComponent('TestMongoDB');
  
  const mongoDb = container.get<MongoDBService>(TYPES.MongoDBService);
  const storageService = container.get<StorageService>(TYPES.StorageService);
  const configService = container.get<ConfigService>(TYPES.ConfigService);
  
  try {
    // Initialize MongoDB
    await mongoDb.initialize();
    logger.info('MongoDB initialized successfully');
    
    // Initialize ConfigService
    await configService.initialize();
    logger.info('ConfigService initialized successfully');
    
    // Test MongoDB connection
    logger.info('Testing MongoDB connection...');
    
    // 1. Test config storage
    const config = await mongoDb.getConfig();
    if (config) {
      logger.info('Configuration retrieved successfully from MongoDB');
      logger.info(`Twitter bearer token: ${config.twitter.bearerToken ? '✓ Present' : '✗ Missing'}`);
      logger.info(`Telegram bot token: ${config.telegram.botToken ? '✓ Present' : '✗ Missing'}`);
      logger.info(`Telegram group ID: ${config.telegram.groupId ? '✓ Present' : '✗ Missing'}`);
    } else {
      logger.warn('No configuration found in MongoDB');
    }
    
    // 2. Test topic filters
    logger.info('Testing topic filters...');
    const topicFilters = await mongoDb.getTopicFilters(1); // Get filters for topic ID 1
    logger.info(`Found ${topicFilters.length} filters for topic ID 1`);
    
    // 3. Test tweet storage
    logger.info('Testing tweet storage...');
    const unanalyzedTweets = await mongoDb.getUnanalyzedTweets(10);
    logger.info(`Found ${unanalyzedTweets.length} unanalyzed tweets`);
    
    // 4. Test monitor state
    logger.info('Testing monitor state...');
    const monitorState = await mongoDb.getMonitorState();
    if (monitorState) {
      logger.info('Monitor state retrieved successfully');
      logger.info(`Last poll times: ${JSON.stringify(monitorState.lastPollTimes)}`);
    } else {
      logger.warn('No monitor state found in MongoDB');
    }
    
    // 5. Test metrics snapshots
    logger.info('Testing metrics snapshots...');
    const metricsSnapshots = await mongoDb.getHistoricalMetrics(10);
    logger.info(`Found ${metricsSnapshots.length} metrics snapshots`);
    
    logger.info('MongoDB migration test completed successfully');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('MongoDB migration test failed:', err);
    logger.error(err.stack || 'No stack trace available');
  } finally {
    // Close MongoDB connection
    await mongoDb.close();
  }
}

// Run the test
testMongoDB().catch(console.error);