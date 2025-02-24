import 'dotenv/config';
import path from 'path';

import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { initializeContainer } from '../src/config/container.js';
import { MigrationManager } from '../src/utils/MigrationManager.js';
import { Logger } from '../src/types/logger.js';
import { Storage } from '../src/storage/storage.js';
import { Config } from '../src/types/storage.js';
import { SearchStrategy } from '../src/twitter/searchStrategy.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { DatabaseManager } from '../src/storage/DatabaseManager.js';
import { SearchQueryConfig } from '../src/types/twitter.js';

// Add process error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

async function initializeServices() {
  // Verify environment variables are loaded
  console.log('Environment variables loaded:', Object.keys(process.env).filter(key => key.startsWith('RETTIWT')).length, 'Rettiwt keys found');

  console.log('Initializing container...');
  const container = initializeContainer();
  console.log('Container initialized');

  console.log('Getting required services...');
  const services = {
    logger: container.get<Logger>(TYPES.Logger),
    storage: container.get<Storage>(TYPES.Storage),
    dbManager: container.get<DatabaseManager>(TYPES.DatabaseManager),
    searchStrategy: container.get<SearchStrategy>(TYPES.SearchStrategy),
    migrationManager: container.get<MigrationManager>(TYPES.MigrationManager),
    metrics: container.get<MetricsManager>(TYPES.MetricsManager)
  };
  console.log('Services retrieved successfully');

  return services;
}

async function initializeSystem(services: ReturnType<typeof initializeServices> extends Promise<infer T> ? T : never) {
  const { dbManager, storage } = services;

  console.log('Initializing database...');
  await dbManager.initialize();
  console.log('Database initialized');

  console.log('Verifying storage...');
  await storage.verify();
  console.log('Storage verified');

  console.log('Loading configuration...');
  const config = await storage.getConfig();
  console.log('Configuration loaded');

  return config;
}

async function processTopic(
  topicId: string,
  searchConfig: SearchQueryConfig,
  services: ReturnType<typeof initializeServices> extends Promise<infer T> ? T : never
) {
  const { searchStrategy, migrationManager, metrics } = services;
  console.log(`Processing topic: ${topicId}`);

  try {
    // Search for tweets
    const tweets = await searchStrategy.search({
      username: searchConfig.accounts?.[0] || '',
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      endDate: new Date(),
      excludeRetweets: searchConfig.excludeRetweets,
      excludeQuotes: searchConfig.excludeQuotes,
      language: searchConfig.language || 'en',
      operator: searchConfig.operator
    });

    if (tweets.length === 0) {
      console.log(`No tweets found for topic: ${topicId}`);
      return;
    }

    console.log(`Found ${tweets.length} tweets for topic: ${topicId}`);

    // Process tweets with both implementations
    await migrationManager.processTweetsWithValidation(tweets, topicId);

    // Get and log statistics
    const stats = await migrationManager.getMigrationStats();
    console.log('Migration statistics:', {
      topicId,
      ...stats
    });

  } catch (error) {
    console.error(`Error processing topic ${topicId}:`, error);
    metrics.increment('migration.validation.topic.errors');
  }
}

async function runMigrationValidation() {
  console.log('Starting migration validation script...');
  
  try {
    // Initialize services
    const services = await initializeServices();
    
    // Initialize system
    const config = await initializeSystem(services);
    
    // Get search queries
    const searchQueries = config.twitter.searchQueries as Record<string, SearchQueryConfig>;
    console.log('Found search queries:', Object.keys(searchQueries));

    // Enable parallel processing
    await services.migrationManager.setParallelProcessing(true);

    // Set timeout for entire process
    const processTimeout = setTimeout(() => {
      throw new Error('Migration validation timed out after 5 minutes');
    }, 5 * 60 * 1000); // 5 minute timeout

    // Process each topic
    for (const [topicId, searchConfig] of Object.entries<SearchQueryConfig>(searchQueries)) {
      await processTopic(topicId, searchConfig, services);
    }

    // Log final statistics
    const finalStats = await services.migrationManager.getMigrationStats();
    console.log('Final migration statistics:', finalStats);

    // Calculate success rate
    const successRate = (finalStats.matches / finalStats.totalProcessed) * 100;
    console.log(`Migration validation success rate: ${successRate.toFixed(2)}%`);

    // Provide recommendations
    if (successRate >= 95) {
      console.log('RECOMMENDATION: Migration validation successful. Safe to proceed with migration.');
    } else if (successRate >= 80) {
      console.log('RECOMMENDATION: Moderate success rate. Investigate mismatches before proceeding.');
    } else {
      console.log('RECOMMENDATION: Low success rate. Significant investigation needed.');
    }

    clearTimeout(processTimeout);

  } catch (error) {
    console.error('Migration validation failed:', error);
    process.exit(1);
  }
}

// Run validation
runMigrationValidation().catch((error) => {
  console.error('Migration validation failed:', error);
  process.exit(1);
});