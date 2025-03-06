import { injectable } from 'inversify';
import { UnifiedConfig, loadConfig, TopicConfig } from '../config/unified.js';

@injectable()
export class ConfigService {
  private config: UnifiedConfig;
  
  constructor() {
    this.config = loadConfig();
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
  
  // For backward compatibility
  getEnvConfig<T>(key: string): T {
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