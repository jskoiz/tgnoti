import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { Logger } from '../../types/logger.js';
import { MongoDBService } from '../../services/MongoDBService.js';
import { Config } from '../../types/storage.js';

@injectable()
export class ConfigStorage {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MongoDBService) private mongoDb: MongoDBService
  ) {
    this.logger.setComponent('ConfigStorage');
  }

  async getConfig(): Promise<Config> {
    try {
      const config = await this.mongoDb.getConfig();
      if (!config) {
        // Create default config if not exists, using environment variables for sensitive data
        const bearerToken = process.env.BEARER_TOKEN || '';
        const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
        const groupId = process.env.TELEGRAM_GROUP_ID || '';
        
        const defaultConfig = {
          twitter: { bearerToken, searchQueries: {}, pollingInterval: 60000 },
          telegram: { 
            botToken, groupId, defaultTopicId: 'default', retryAttempts: 3 
          }
        };
        await this.saveConfig(defaultConfig);
        return defaultConfig;
      }
      return config;
    } catch (error) {
      this.logger.error('Failed to get configuration', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async saveConfig(config: Config): Promise<void> {
    try {
      await this.mongoDb.saveConfig(config);
      this.logger.debug('Configuration saved successfully');
    } catch (error) {
      this.logger.error('Failed to save configuration', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}