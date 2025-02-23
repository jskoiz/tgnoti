import { RetryPolicy } from './retry.js';
import { TopicConfig } from './topics.js';
import { validateConfig } from './validation.js';
import { TwitterConfig } from './twitter.js';
import { TelegramConfig } from './telegram.js';
import { MonitoringConfig } from './monitoring.js';
import { FilterStrategy } from './filterStrategies.js';

/**
 * Core application configuration interface
 */
export interface AppConfig {
  twitter: TwitterConfig;
  telegram: TelegramConfig;
  monitoring: MonitoringConfig;
  topics: TopicConfig[];
}

/**
 * Load and validate the application configuration
 */
export async function loadConfig(): Promise<AppConfig> {
  // This will be implemented after environment.ts is created
  const config = {} as AppConfig; // Placeholder
  
  // Validate the configuration
  const validationResult = validateConfig(config);
  if (!validationResult.valid) {
    throw new Error(`Invalid configuration: ${validationResult.errors.join(', ')}`);
  }

  return config;
}

// Export all configuration types and utilities
export * from './retry.js';
export * from './topics.js';
export * from './validation.js';
export * from './twitter.js';
export * from './telegram.js';
export * from './monitoring.js';
export * from './filterStrategies.js';