// Load environment variables first
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';

import 'reflect-metadata';
import { Logger } from './types/logger.js';
import { TYPES } from './types/di.js';
import { TwitterNotifier } from './core/TwitterNotifier.js';
import { initializeContainer } from './config/container.js';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  try {
    const envPath = `${dirname(__dirname)}/.env`;
    console.log('Loading environment variables from:', envPath);
    
    // Load .env file from project root
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error('Error loading .env file:', result.error);
    }
    
    // Verify environment variables are loaded
    if (!process.env.SEARCH_WINDOW_MINUTES) {
      console.error('Required environment variable SEARCH_WINDOW_MINUTES is not set');
      process.exit(1);
    }
    
    // Initialize the DI container
    const container = await initializeContainer(); // Now properly awaited
    
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
    console.error('Failed to start application:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
