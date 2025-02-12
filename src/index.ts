import './config/initialization.js';
import { TwitterNotifier } from './core/TwitterNotifier.js';
import { container } from './config/container.js';
import { TYPES } from './types/di.js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePath = path.join(__dirname, '..');

// Get TwitterNotifier instance from DI container
const notifier = container.get<TwitterNotifier>(TYPES.TwitterNotifier);

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  console.log('Received SIGINT. Shutting down...');
  await notifier.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM. Shutting down...');
  await notifier.stop();
  process.exit(0);
});

// Start the notifier
notifier.start().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
