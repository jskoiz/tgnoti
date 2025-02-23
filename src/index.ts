import 'reflect-metadata';
import * as dotenv from 'dotenv';

dotenv.config();
import { Logger } from './types/logger.js';
import { TYPES } from './types/di.js';
import { TwitterNotifier } from './core/TwitterNotifier.js';
import { initializeContainer } from './config/container.js';

async function main() {
  try {
    // Initialize the DI container
    const container = await initializeContainer();
    
    // Get logger instance
    const logger = container.get<Logger>(TYPES.Logger);
    logger.info('Application starting...');

    // Initialize the Twitter notifier
    const twitterNotifier = container.get<TwitterNotifier>(TYPES.TwitterNotifier);
    await twitterNotifier.start();

    // Handle shutdown gracefully
    process.on('SIGINT', async () => {
      logger.info('Shutting down...');
      await twitterNotifier.stop();
      process.exit(0);
    });

    logger.info('Application started successfully');
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
