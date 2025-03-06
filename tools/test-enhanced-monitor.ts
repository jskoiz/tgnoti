#!/usr/bin/env node

import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { createContainer } from '../src/config/container.js';
import { EnhancedTweetMonitor } from '../src/services/EnhancedTweetMonitor.js';
import { EnhancedMetricsManager } from '../src/core/monitoring/EnhancedMetricsManager.js';
import { StorageService } from '../src/services/StorageService.js';
import { Logger } from '../src/types/logger.js';

async function main() {
  console.log('Initializing container...');
  const container = createContainer();
  
  // Initialize storage service
  console.log('Initializing storage service...');
  const storageService = container.get<StorageService>(TYPES.StorageService);
  await storageService.initialize();
  
  // Get logger
  const logger = container.get<Logger>(TYPES.Logger);
  logger.setComponent('TestEnhancedMonitor');
  
  try {
    // Initialize enhanced monitor
    console.log('Initializing enhanced tweet monitor...');
    const monitor = container.get<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor);
    await monitor.initialize();
    
    // Get metrics manager
    const metrics = container.get<EnhancedMetricsManager>(TYPES.EnhancedMetricsManager);
    
    // Start monitor
    console.log('Starting enhanced tweet monitor...');
    await monitor.start();
    
    // Wait for a few cycles
    console.log('Running for 5 minutes...');
    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    
    // Get health status
    console.log('Getting health status...');
    const health = await monitor.healthCheck();
    console.log('Health status:', JSON.stringify(health, null, 2));
    
    // Get metrics
    console.log('Metrics:');
    console.log(JSON.stringify(Object.fromEntries(metrics.getMetrics()), null, 2));
    
    // Stop monitor
    console.log('Stopping monitor...');
    await monitor.stop();
    
    // Persist metrics one last time
    await metrics.persistMetrics();
    
    console.log('Done!');
  } catch (error) {
    logger.error('Error running enhanced monitor test:', error instanceof Error ? error : new Error(String(error)));
  } finally {
    // Close storage
    await storageService.close();
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});