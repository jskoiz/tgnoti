import 'reflect-metadata';
import { config } from 'dotenv';
import { initializeContainer } from './config/container.js';
import { TYPES } from './types/di.js';
import { Logger } from './types/logger.js';
import { ConfigService } from './services/ConfigService.js';
import { MongoDBService } from './services/MongoDBService.js';
import { StorageService } from './services/StorageService.js';
import { TwitterService } from './services/TwitterService.js';
import { TelegramService } from './services/TelegramService.js';
import { TweetProcessor } from './services/TweetProcessor.js';
import { EnhancedTweetMonitor } from './services/EnhancedTweetMonitor.js';
import { EnhancedMetricsManager } from './core/monitoring/EnhancedMetricsManager.js';
import { EnhancedRateLimiter } from './utils/enhancedRateLimiter.js';
import { CircuitBreakerConfig, EnhancedCircuitBreakerConfig } from './types/monitoring-enhanced.js';
import { MetricsManager } from './core/monitoring/MetricsManager.js';
import { ConsoleLogger } from './utils/logger.js';
import { LoggingConfig } from './config/loggingConfig.js';

async function bootstrap() {
  // Load environment variables from .env file first
  // This ensures all environment variables are available before any other initialization
  const dotenvResult = config();
  if (dotenvResult.error) {
    console.error('Failed to load .env file:', dotenvResult.error);
  }
  // Initialize the container from container.ts
  const container = await initializeContainer();

  // Note: The container from initializeContainer already has all services initialized

  const logger = container.get<Logger>(TYPES.Logger);
  logger.setComponent('Main');
  
  try {
    logger.info('Starting Twitter Notification Service');
    
    // Get MongoDB service
    const mongoService = container.get<MongoDBService>(TYPES.MongoDBService);
    
    // Initialize storage service (which will initialize MongoDB)
    const storageService = container.get<StorageService>(TYPES.StorageService);
    await storageService.initialize();
    
    // Get references to services for shutdown handling
    const telegramService = container.get<TelegramService>(TYPES.TelegramService);
    const monitor = container.get<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor);
    
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      if (monitor) {
        await monitor.stop(); 
      }
      
      try {
        await telegramService.stop();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Error stopping Telegram service:', err);
      }
      
      if (mongoService) {
        await mongoService.close();
      }
      process.exit(0);
    });
    
    logger.info('Service started successfully');
  } catch (error) {
    logger.error('Failed to start service:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

bootstrap().catch(error => {
  console.error('Unhandled error in bootstrap:', error);
  process.exit(1);
});
