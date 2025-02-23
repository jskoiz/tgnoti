import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { TopicConfig } from '../types/telegram.js';
import { TOPIC_CONFIG } from '../config/topicConfig.js';
import TelegramBotApi from 'node-telegram-bot-api';

@injectable()
export class TopicManager {
  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {}

  /**
   * Get the appropriate topic ID to use, considering fallbacks
   */
  async getTopicId(
    bot: TelegramBotApi,
    groupId: string,
    topicId: string
  ): Promise<string> {
    try {
      this.logger.debug(`Validating topic access for topic ${topicId}`);
      
      // Check if topic exists in config
      const topicConfig = Object.values(TOPIC_CONFIG).find((config: TopicConfig) => config.id === topicId);
      if (!topicConfig) {
        this.logger.warn(`Topic ${topicId} not found in TOPIC_CONFIG, attempting direct validation`);
      }

      // Try to validate access to the requested topic
      if (await this.validateTopicAccess(bot, groupId, topicId)) {
        return topicId;
      }

      // If primary topic is inaccessible, try fallback
      const fallbackId = this.getFallbackTopicId(topicId);
      if (fallbackId && await this.validateTopicAccess(bot, groupId, fallbackId)) {
        this.logger.warn(
          `Topic ${topicId} is inaccessible, falling back to ${fallbackId}`
        );
        return fallbackId;
      }

      // If both primary and fallback are inaccessible, use default topic
      if (!TOPIC_CONFIG.GENERAL) {
        this.logger.error('GENERAL topic not found in TOPIC_CONFIG');
        throw new Error('Missing GENERAL topic configuration');
      }

      const defaultTopic = TOPIC_CONFIG.GENERAL.id;
      this.logger.warn(
        `Topics ${topicId} and ${fallbackId} are inaccessible, using default topic ${defaultTopic}`
      );
      return defaultTopic;
    } catch (error) {
      this.logger.error('Error determining topic access:', error as Error);
      // Don't silently fall back to GENERAL, throw the error
      throw error;
    }
  }

  /**
   * Check if a topic is accessible
   */
  private async validateTopicAccess(
    bot: TelegramBotApi,
    groupId: string,
    topicId: string
  ): Promise<boolean> {
    try {
      this.logger.debug(`Attempting to validate topic ${topicId} in group ${groupId}`);
      // Try to get topic info - this will fail if topic is inaccessible
      await bot.getChat(`${groupId}/${topicId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.toLowerCase().includes('topic_closed')) {
        this.logger.warn(`Topic ${topicId} is closed`);
      } else {
        this.logger.error(`Error validating topic ${topicId} in group ${groupId}:`, error as Error);
      }
      return false;
    }
  }

  /**
   * Get the fallback topic ID for a given topic
   */
  private getFallbackTopicId(topicId: string): string | null {
    const config = Object.values(TOPIC_CONFIG).find((c: TopicConfig) => c.id === topicId);
    return config?.fallbackId || null;
  }

  /**
   * Check if a topic is required (messages must be delivered)
   */
  isRequiredTopic(topicId: string): boolean {
    const config = Object.values(TOPIC_CONFIG).find((c: TopicConfig) => c.id === topicId);
    return config?.isRequired || false;
  }
}
