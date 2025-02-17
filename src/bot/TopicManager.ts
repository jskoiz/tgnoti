import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { TopicConfig, TOPIC_CONFIG } from '../types/telegram.js';
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
      const defaultTopic = TOPIC_CONFIG.GENERAL.id;
      this.logger.warn(
        `Topics ${topicId} and ${fallbackId} are inaccessible, using default topic ${defaultTopic}`
      );
      return defaultTopic;
    } catch (error) {
      this.logger.error('Error determining topic access:', error as Error);
      return TOPIC_CONFIG.GENERAL.id;
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
      // Try to get topic info - this will fail if topic is inaccessible
      await bot.getChat(`${groupId}/${topicId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.toLowerCase().includes('topic_closed')) {
        this.logger.warn(`Topic ${topicId} is closed`);
      } else {
        this.logger.error(`Error validating topic ${topicId}:`, error as Error);
      }
      return false;
    }
  }

  /**
   * Get the fallback topic ID for a given topic
   */
  private getFallbackTopicId(topicId: string): string | null {
    const config = Object.values(TOPIC_CONFIG).find(c => c.id === topicId);
    return config?.fallbackId || null;
  }

  /**
   * Check if a topic is required (messages must be delivered)
   */
  isRequiredTopic(topicId: string): boolean {
    const config = Object.values(TOPIC_CONFIG).find(c => c.id === topicId);
    return config?.isRequired || false;
  }
}