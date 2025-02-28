import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { TopicConfig } from '../../types/topics.js';
import { getTopicById, telegramConfig } from '../../config/topicConfig.js';
import TelegramBotApi from 'node-telegram-bot-api';

@injectable()
export class TopicManager {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
  ) {
    this.logger.debug('TopicManager initialized');
  }

  /**
   * Get the appropriate topic ID to use, considering fallbacks
   */
  async getTopicId(
    bot: TelegramBotApi,
    groupId: string,
    topicId: string
  ): Promise<string> {
    try {
      this.logger.info(`Validating topic access for topic ${topicId} in group ${groupId}`);
      
      // Check if topic exists in config
      const topic = getTopicById(Number(topicId));
      if (!topic) {
        this.logger.warn(`Topic ${topicId} not found in monitoring config, attempting direct validation`);
      }

      // Try to validate access to the requested topic
      if (await this.validateTopicAccess(bot, groupId, topicId)) {
        this.logger.info(`Successfully validated access to topic ${topicId}`);
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
      const defaultTopic = telegramConfig.defaultTopicId.toString();
      if (!defaultTopic) {
        this.logger.error('Default topic not configured');
        throw new Error('Missing default topic configuration');
      }

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
      this.logger.info(`Attempting to validate topic ${topicId} in group ${groupId} with full path: ${groupId}/${topicId}`);
      // Get the group chat info - topics are validated through message_thread_id parameter when sending
      await bot.getChat(groupId);
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
    // For now, always fall back to default topic
    return telegramConfig.defaultTopicId.toString();
  }

  /**
   * Check if a topic is required (messages must be delivered)
   */
  isRequiredTopic(topicId: string): boolean {
    const topic = getTopicById(Number(topicId));
    return topic ? topic[1].notification.enabled : false;
  }
}
