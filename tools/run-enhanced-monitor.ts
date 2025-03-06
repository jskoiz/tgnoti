#!/usr/bin/env node

import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { initializeContainer } from '../src/config/container.js';
import { EnhancedTweetMonitor } from '../src/services/EnhancedTweetMonitor.js';
import { Logger } from '../src/types/logger.js';

async function main() {
  console.log('Initializing container...');
  const container = await initializeContainer();
  
  // Get logger
  const logger = container.get<Logger>(TYPES.Logger);
  logger.setComponent('RunEnhancedMonitor');
  
  try {
    // Get enhanced monitor
    const monitor = container.get<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor);
    
    // Initialize and start monitor
    logger.info('Initializing enhanced tweet monitor...');
    await monitor.initialize();
    
    logger.info('Starting enhanced tweet monitor...');
    await monitor.start();
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await monitor.stop();
      process.exit(0);
    });
    
    // Log health status every 5 minutes
    setInterval(async () => {
      try {
        const health = await monitor.healthCheck();
        logger.info('Health status:', health);
      } catch (error) {
        logger.error('Error getting health status:', error instanceof Error ? error : new Error(String(error)));
      }
    }, 5 * 60 * 1000);
    
    logger.info('Enhanced tweet monitor running. Press Ctrl+C to stop.');
  } catch (error) {
    logger.error('Error running enhanced monitor:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});