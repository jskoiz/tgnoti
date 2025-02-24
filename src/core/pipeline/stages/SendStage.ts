import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { PipelineStage, StageResult, TweetContext, SendStageMetadata } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../../utils/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { TelegramMessageQueue } from '../../../telegram/TelegramMessageQueue.js';
import { TelegramQueueConfig } from '../../../types/telegram.js';
import { Storage } from '../../../storage/storage.js';
import { MonitoringType } from '../../../types/monitoring.js';
import { QueuedMessage } from '../../../types/telegram.js';
import { MonitoringDashboard } from '../../../utils/MonitoringDashboard.js';

@injectable()
export class SendStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'send';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TelegramMessageQueue) private messageQueue: TelegramMessageQueue,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.TelegramQueueConfig) private queueConfig: TelegramQueueConfig,
    @inject(TYPES.MonitoringDashboard) private dashboard: MonitoringDashboard
  ) {}

  /**
   * Execute the send stage
   */
  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();
    this.logger.debug('Starting send stage', {
      topicId: context.topicId,
      tweetId: context.tweet.id
    });

    try {
      if (!context.metadata.send?.formattedMessage) {
        return {
          success: false,
          data: context,
          error: new Error('No formatted message available'),
          metadata: {
            errorType: 'MISSING_MESSAGE'
          }
        };
      }

      // Convert topicId to number and validate
      const chatId = Number(context.topicId);
      if (isNaN(chatId)) {
        return {
          success: false,
          data: context,
          error: new Error('Invalid chat ID'),
          metadata: {
            errorType: 'INVALID_CHAT_ID',
            topicId: context.topicId
          }
        };
      }

      // Prepare message for queue
      const queueMessage: Omit<QueuedMessage, 'id' | 'firstAttempt' | 'retryCount'> = {
        chatId,
        content: context.metadata.send.formattedMessage,
        messageOptions: {
          parse_mode: 'HTML',
          reply_markup: context.metadata.send?.messageButtons ? {
            inline_keyboard: context.metadata.send.messageButtons
          } : undefined
        },
        priority: this.calculatePriority(context)
      };

      // Queue the message
      const messageId = await this.messageQueue.queueMessage(queueMessage);

      if (!messageId) {
        return {
          success: false,
          data: context,
          error: new Error('Failed to queue message'),
          metadata: {
            errorType: 'QUEUE_ERROR'
          }
        };
      }

      // Mark tweet as seen after successful queueing
      await this.storage.markSeen(context.tweet.id, context.topicId);

      // Get queue status
      const queueStatus = this.messageQueue.getQueueStatus();
      const queueMetrics = this.messageQueue.getMetrics();

      // Update context with send results
      const updatedContext: TweetContext = {
        ...context,
        sent: true,
        metadata: {
          ...context.metadata, 
          send: {
            formattedMessage: context.metadata.send?.formattedMessage,
            messageButtons: context.metadata.send?.messageButtons,
            sendDurationMs: Date.now() - startTime,
            queueMessageId: messageId,
            queueStatus: {
              position: queueStatus.currentQueueSize,
              isProcessing: queueStatus.isProcessing,
              isPaused: queueStatus.isPaused
            },
            queueMetrics: queueMetrics
          }
        }
      };

      this.recordMetrics(startTime, true, {
        queueSize: queueStatus.currentQueueSize
      });
      
      // Update monitoring dashboard
      this.dashboard.updateQueueMetrics(queueMetrics);
      this.dashboard.updateTopicMetrics(
        context.topicId,
        'Send Stage',
        MonitoringType.Mention,
        true,
        Date.now() - startTime
      );

      return {
        success: true,
        data: updatedContext,
        metadata: {
          send: {
            sendDurationMs: Date.now() - startTime,
            queueMessageId: messageId,
            queueStatus: {
              position: queueStatus.currentQueueSize,
              isProcessing: queueStatus.isProcessing,
              isPaused: queueStatus.isPaused
            },
            queueMetrics: queueMetrics,
            retryAttempt: 0
          }
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Send stage');
      this.recordMetrics(startTime, false);

      // Update monitoring dashboard with error
      this.dashboard.updateTopicMetrics(
        context.topicId,
        'Send Stage',
        MonitoringType.Mention,
        false,
        Date.now() - startTime
      );
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          send: {
            sendDurationMs: Date.now() - startTime,
            errorType: this.categorizeError(err),
            errorMessage: err.message,
            retryAttempt: (context.metadata.send?.retryAttempt ?? 0) + 1,
            nextRetryTime: this.calculateNextRetryTime(context)
          }
        }
      };
    }
  }

  /**
   * Calculate message priority based on tweet metrics and age
   */
  private calculatePriority(context: TweetContext): number {
    const { tweet } = context;
    let priority = 1; // Default priority

    // Increase priority for tweets with high engagement
    if (tweet.likeCount > 1000 || tweet.retweetCount > 500) {
      priority += 1;
    }

    // Increase priority for recent tweets
    const tweetAge = Date.now() - new Date(tweet.createdAt).getTime();
    if (tweetAge < 1800000) { // Less than 30 minutes old
      priority += 1;
    }

    // Increase priority for tweets with media
    if (tweet.media?.length) {
      priority += 1;
    }

    return Math.min(priority, 4); // Cap priority at 4
  }

  /**
   * Categorize errors for better handling and metrics
   */
  private categorizeError(error: Error): string {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('rate limit')) {
      return 'RATE_LIMIT';
    }
    if (errorMessage.includes('network')) {
      return 'NETWORK_ERROR';
    }
    if (errorMessage.includes('timeout')) {
      return 'TIMEOUT';
    }
    if (errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      return 'AUTH_ERROR';
    }
    if (errorMessage.includes('not found')) {
      return 'NOT_FOUND';
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate next retry time using exponential backoff
   */
  private calculateNextRetryTime(context: TweetContext): Date | undefined {
    const retryAttempt = context.metadata.send?.retryAttempt ?? 0;
    if (retryAttempt >= this.queueConfig.maxRetries) {
      return undefined;
    }

    const baseDelay = this.queueConfig.baseDelayMs;
    const backoffDelay = baseDelay * Math.pow(2, retryAttempt);
    const jitter = Math.random() * 1000; // Add some randomness
    return new Date(Date.now() + backoffDelay + jitter);
  }

  /**
   * Record send metrics
   */
  private recordMetrics(
    startTime: number,
    success: boolean,
    data?: { queueSize: number }
  ): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.send.duration', duration);
    this.metrics.increment(`pipeline.send.${success ? 'success' : 'failure'}`);

    if (data) {
      this.metrics.gauge('pipeline.send.queue_size', data.queueSize);
      this.metrics.timing('pipeline.send.queue_wait', data.queueSize * this.queueConfig.baseDelayMs);
    }
  }
}