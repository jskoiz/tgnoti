// Re-export types from individual config files
export * from './twitter.js';
export * from './telegram.js';
export * from './monitoring.js';

// Define the complete application configuration type
export interface AppConfig {
  twitter: import('./twitter.js').TwitterConfigV2;
  telegram: import('./telegram.js').TelegramConfig;
  monitoring: import('./monitoring.js').MonitoringConfig;
}