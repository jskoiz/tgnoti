import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { Tweet } from '../types/twitter.js';
import { TopicConfig } from '../config/unified.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { ITelegramMessageQueue } from '../types/telegram.js';
import { DiscordWebhookService } from './DiscordWebhookService.js';
import { IDeliveryService, DeliveryMetrics, TopicDeliveryConfig } from '../types/delivery.js';

@injectable()
export class DeliveryManager implements IDeliveryService {
  private topicDeliveryConfigs: Map<number, TopicDeliveryConfig> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TelegramMessageQueue) private telegramQueue: ITelegramMessageQueue,
    @inject(TYPES.DiscordWebhookService) private discordService: DiscordWebhookService
  ) {
    this.logger.setComponent('DeliveryManager');
    this.initializeTopicConfigurations();
  }

  private initializeTopicConfigurations(): void {
    // Configure MASS_TRACKING to use Discord as primary delivery method
    this.topicDeliveryConfigs.set(33763, { // MASS_TRACKING topic ID
      topicId: 33763,
      deliveryMethods: {
        discord: {
          enabled: true,
          priority: 1, // Primary delivery method
          config: {}
        },
        telegram: {
          enabled: true,
          priority: 2, // Fallback delivery method
          config: {}
        }
      }
    });

    // Configure other topics to use Telegram as primary
    const telegramPrimaryTopics = [6545, 12111, 12110, 381, 6531]; // AFFILIATE_MONITORING, COMPETITOR_TWEETS, COMPETITOR_MENTIONS, TROJAN, KOL_MONITORING
    
    telegramPrimaryTopics.forEach(topicId => {
      this.topicDeliveryConfigs.set(topicId, {
        topicId,
        deliveryMethods: {
          telegram: {
            enabled: true,
            priority: 1,
            config: {}
          },
          discord: {
            enabled: false,
            priority: 2,
            config: {}
          }
        }
      });
    });

    this.logger.info(`Initialized delivery configurations for ${this.topicDeliveryConfigs.size} topics`);
    this.logger.info(`MASS_TRACKING (33763) configured for Discord primary delivery`);
  }

  async sendTweetNotification(tweet: Tweet, topic: TopicConfig): Promise<void> {
    const topicId = topic.id;
    const deliveryConfig = this.topicDeliveryConfigs.get(topicId);
    
    if (!deliveryConfig) {
      // Default to Telegram for unconfigured topics
      this.logger.debug(`No delivery config for topic ${topicId}, using default Telegram delivery`);
      await this.sendToTelegram(tweet, topic);
      return;
    }

    // Get enabled delivery methods sorted by priority
    const enabledMethods = Object.entries(deliveryConfig.deliveryMethods)
      .filter(([_, config]) => config.enabled)
      .sort(([_, a], [__, b]) => a.priority - b.priority);

    if (enabledMethods.length === 0) {
      this.logger.warn(`No enabled delivery methods for topic ${topicId}`);
      return;
    }

    // Try delivery methods in priority order
    for (const [methodName, methodConfig] of enabledMethods) {
      try {
        await this.deliverViaMethod(methodName as any, tweet, topic);
        this.metrics.increment(`delivery.${methodName}.success`);
        this.logger.debug(`Successfully delivered tweet ${tweet.id} via ${methodName} for topic ${topic.name}`);
        return; // Success, no need to try fallback methods
      } catch (error) {
        this.logger.error(`Failed to deliver tweet ${tweet.id} via ${methodName} for topic ${topic.name}:`, error instanceof Error ? error : new Error(String(error)));
        this.metrics.increment(`delivery.${methodName}.error`);
        
        // Continue to next delivery method
        continue;
      }
    }

    // All delivery methods failed
    this.logger.error(`All delivery methods failed for tweet ${tweet.id} in topic ${topic.name}`);
    this.metrics.increment('delivery.all_methods_failed');
  }

  private async deliverViaMethod(method: 'telegram' | 'discord', tweet: Tweet, topic: TopicConfig): Promise<void> {
    switch (method) {
      case 'discord':
        await this.sendToDiscord(tweet, topic);
        break;
      case 'telegram':
        await this.sendToTelegram(tweet, topic);
        break;
      default:
        throw new Error(`Unknown delivery method: ${method}`);
    }
  }

  private async sendToDiscord(tweet: Tweet, topic: TopicConfig): Promise<void> {
    await this.discordService.sendTweetNotification(tweet, topic);
    this.logger.info(`Discord notification sent for tweet ${tweet.id} from @${tweet.tweetBy?.userName} to topic ${topic.name}`);
  }

  private async sendToTelegram(tweet: Tweet, topic: TopicConfig): Promise<void> {
    // This is a simplified version - in practice, you'd want to use the same logic from TweetProcessor
    // For now, we'll throw an error to indicate this needs to be implemented
    throw new Error('Telegram delivery via DeliveryManager not yet implemented - use TweetProcessor directly');
  }

  getQueueLength(): number {
    // Return combined queue lengths
    const telegramQueueLength = 0; // Would need to expose this from TelegramMessageQueue
    const discordQueueLength = this.discordService.getQueueLength();
    return telegramQueueLength + discordQueueLength;
  }

  getMetrics(): DeliveryMetrics {
    const discordMetrics = this.discordService.getMetrics();
    
    return {
      queued: discordMetrics.queued,
      sent: discordMetrics.sent,
      errors: discordMetrics.errors,
      dropped: discordMetrics.dropped
    };
  }

  // Configuration management methods
  updateTopicDeliveryConfig(topicId: number, config: TopicDeliveryConfig): void {
    this.topicDeliveryConfigs.set(topicId, config);
    this.logger.info(`Updated delivery configuration for topic ${topicId}`);
  }

  getTopicDeliveryConfig(topicId: number): TopicDeliveryConfig | undefined {
    return this.topicDeliveryConfigs.get(topicId);
  }

  getAllTopicConfigs(): Map<number, TopicDeliveryConfig> {
    return new Map(this.topicDeliveryConfigs);
  }

  // Enable/disable Discord for specific topic
  setDiscordEnabledForTopic(topicId: number, enabled: boolean): void {
    const config = this.topicDeliveryConfigs.get(topicId);
    if (config && config.deliveryMethods.discord) {
      config.deliveryMethods.discord.enabled = enabled;
      this.logger.info(`${enabled ? 'Enabled' : 'Disabled'} Discord delivery for topic ${topicId}`);
    }
  }

  // Get delivery statistics
  getDeliveryStats(): { [topicId: number]: { [method: string]: { enabled: boolean; priority: number } } } {
    const stats: { [topicId: number]: { [method: string]: { enabled: boolean; priority: number } } } = {};
    
    this.topicDeliveryConfigs.forEach((config, topicId) => {
      stats[topicId] = {};
      Object.entries(config.deliveryMethods).forEach(([method, methodConfig]) => {
        stats[topicId][method] = {
          enabled: methodConfig.enabled,
          priority: methodConfig.priority
        };
      });
    });
    
    return stats;
  }
}