import { injectable, inject } from 'inversify';
import { UnifiedConfig, loadConfig, TopicConfig } from '../config/unified.js';
import { AFFILIATE_TRACKING_CONFIG } from '../config/topicConfig.js';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { StorageService } from './StorageService.js';
import { Config } from '../types/storage.js';
import { Container } from 'inversify';

// Declare global container for DI
declare global {
  var container: Container | undefined;
}

@injectable()
export class ConfigService {
  private config: UnifiedConfig;
  private mongoConfig: Config | null = null;
  private useMongoConfig: boolean = false;
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {
    this.logger.setComponent('ConfigService');
    this.config = loadConfig();
  }
  
  async initialize(): Promise<void> {
    try {
      // Try to get StorageService from container
      // We need to get it this way to avoid circular dependency
      const storageService = global.container?.get(TYPES.StorageService) as StorageService | undefined;
      
      if (storageService) {
        this.mongoConfig = await storageService.getConfig();
        if (this.mongoConfig) {
          this.useMongoConfig = true;
          this.logger.info('Using MongoDB-based configuration');
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('Failed to load MongoDB configuration, using unified config', err);
    }
  }
  
  getTwitterConfig() {
    return this.config.twitter;
  }
  
  getTelegramConfig() {
    return this.config.telegram;
  }
  
  getTopics(): TopicConfig[] {
    return this.config.topics;
  }
  
  getTopicById(id: number): TopicConfig | undefined {
    return this.config.topics.find(topic => topic.id === id);
  }
  
  getMongoDBConfig() {
    return this.config.mongodb;
  }
  
  getSystemConfig() {
    return this.config.system;
  }
  
  /**
   * Get the affiliate tracking configuration
   * @returns The affiliate tracking configuration
   */
  getAffiliateTrackingConfig() {
    return AFFILIATE_TRACKING_CONFIG;
  }
  
  // For backward compatibility
  getEnvConfig<T>(key: string): T {
    if (this.useMongoConfig && this.mongoConfig) {
      switch (key) {
        case 'BEARER_TOKEN':
          return this.mongoConfig.twitter.bearerToken as unknown as T;
        case 'TELEGRAM_BOT_TOKEN':
          return this.mongoConfig.telegram.botToken as unknown as T;
        case 'TELEGRAM_GROUP_ID':
          return this.mongoConfig.telegram.groupId as unknown as T;
        default:
          return process.env[key] as unknown as T;
      }
    } else {
      switch (key) {
        case 'BEARER_TOKEN':
          return this.config.twitter.api.bearerToken as unknown as T;
        case 'TELEGRAM_BOT_TOKEN':
          return this.config.telegram.api.botToken as unknown as T;
        case 'TELEGRAM_GROUP_ID':
          return this.config.telegram.api.groupId as unknown as T;
        default:
          return process.env[key] as unknown as T;
      }
    }
  }
}