import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { ITelegramMessageQueue } from '../../../types/telegram.js';
import { EventBus } from '../EventBus.js';
import { FormattedTweetEvent, SentTweetEvent, TwitterEvent, ErrorEvent } from '../EventTypes.js';

/**
 * Handler for sending formatted tweets to Telegram
 * This replaces the SendStage in the pipeline
 */
@injectable()
export class SenderHandler {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TelegramMessageQueue) private messageQueue: ITelegramMessageQueue,
    @inject(TYPES.EventBus) private eventBus: EventBus
  ) {
    // Subscribe to formatted tweet events
    this.eventBus.subscribe(this.handleFormattedEvent.bind(this), {
      eventType: 'formatted_tweet',
      priority: 30, // Run after formatter handler
      id: 'sender_handler'
    });
  }

  /**
   * Handle formatted tweet events
   */
  private handleFormattedEvent(event: TwitterEvent): Promise<void> {
    if (event.type !== 'formatted_tweet' || !('tweet' in event)) return Promise.resolve();
    
    const formattedEvent = event as FormattedTweetEvent;
    return this.handleEvent(formattedEvent);
  }

  /**
   * Send the formatted tweet to Telegram
   */
  async handleEvent(event: FormattedTweetEvent): Promise<void> {
    const startTime = Date.now();
    this.logger.debug('Starting tweet sending', {
      tweetId: event.tweet.id,
      topicId: event.topicId
    });

    try {
      // Queue the message for sending
      const messageId = await this.messageQueue.queueMessage({
        chatId: Number(process.env.TELEGRAM_GROUP_ID || '0'),
        threadId: Number(event.topicId) || undefined,
        tweetId: event.tweet.id,
        content: event.formattedMessage,
        messageOptions: {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          // Add buttons if available
          reply_markup: event.messageButtons ? {
            inline_keyboard: event.messageButtons
          } : undefined
        },
        tweetMetadata: {
          tweet: event.tweet,
          type: event.metadata?.type || 'original',
          matchedTopic: event.rules[0] || undefined
        },
        priority: 1, // High priority
      });
      
      // Create sent event
      const sentEvent: SentTweetEvent = {
        id: `sent_${event.id}`,
        timestamp: new Date(),
        type: 'sent_tweet',
        tweet: event.tweet,
        topicId: event.topicId,
        metadata: {
          ...event.metadata,
          send: {
            sendDurationMs: Date.now() - startTime,
            queuedAt: new Date().toISOString()
          }
        },
        isValid: event.isValid,
        validationReason: event.validationReason,
        matched: event.matched,
        rules: event.rules,
        formattedMessage: event.formattedMessage,
        messageButtons: event.messageButtons,
        messageId,
        deliveryStatus: 'queued'
      };
      
      // Publish sent event
      await this.eventBus.publish(sentEvent);
      
      // Record metrics
      this.recordMetrics(startTime, true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Tweet sending');
      this.recordMetrics(startTime, false);
      
      // Publish error event
      const errorEvent: ErrorEvent = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        type: 'error',
        error: err,
        source: 'sender_handler',
        context: {
          tweetId: event.tweet?.id,
          topicId: event.topicId
        }
      };
      await this.eventBus.publish(errorEvent);
    }
  }

  /**
   * Record metrics for sending
   */
  private recordMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('sending.duration', duration);
    this.metrics.increment(`sending.${success ? 'success' : 'failure'}`);
  }
}