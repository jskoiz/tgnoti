import { injectable, inject } from 'inversify';
import { v4 as uuidv4 } from 'uuid';
import {
  QueuedMessage,
  TelegramQueueConfig,
  TelegramQueueMetrics,
  ITelegramMessageQueue,
  SendMessageResult,
  TelegramError
} from '../types/telegram.js';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { ITelegramMessageSender } from './TelegramMessageSender.js';

@injectable()
export class TelegramMessageQueue implements ITelegramMessageQueue {
  private queue: QueuedMessage[] = [];
  private processing: boolean = false;
  private paused: boolean = false;
  private lastSendTime: Date = new Date();
  private windowStartTime: Date = new Date();
  private messagesSentInWindow: number = 0;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TelegramMessageSender) private messageSender: ITelegramMessageSender,
    @inject(TYPES.TelegramQueueConfig) private config: TelegramQueueConfig
  ) {}

  async queueMessage(message: Omit<QueuedMessage, 'id' | 'firstAttempt' | 'retryCount'>): Promise<string> {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error('Queue is full');
    }

    const queuedMessage: QueuedMessage = {
      ...message,
      id: uuidv4(),
      firstAttempt: new Date(),
      retryCount: 0
    };

    this.queue.push(queuedMessage);
    this.sortQueue();
    
    this.logger.debug(`Queued message ${queuedMessage.id}, queue length: ${this.queue.length}`);
    this.metrics.increment('telegram.queue.messages.queued');

    if (!this.processing && !this.paused) {
      this.processQueue().catch(error => {
        this.logger.error('Error processing queue:', error as Error);
      });
    }

    return queuedMessage.id;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // First by priority (higher first)
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      // Then by retry count (lower first)
      if (a.retryCount !== b.retryCount) {
        return a.retryCount - b.retryCount;
      }
      // Finally by first attempt time (older first)
      return a.firstAttempt.getTime() - b.firstAttempt.getTime();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.paused || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.logger.debug('Starting queue processing');

    try {
      while (this.queue.length > 0 && !this.paused) {
        if (!await this.canSendMessage()) {
          this.logger.debug('Rate limit reached, pausing queue processing');
          break;
        }

        const message = this.queue[0];
        const now = new Date();

        if (message.nextAttemptTime && message.nextAttemptTime > now) {
          this.logger.debug(`Message ${message.id} waiting for retry after ${message.nextAttemptTime}`);
          break;
        }

        const result = await this.sendMessage(message);

        if (result.success) {
          this.queue.shift(); // Remove sent message
          this.messagesSentInWindow++;
          this.lastSendTime = new Date();
          this.metrics.increment('telegram.queue.messages.sent');
          this.logger.debug(`Successfully sent message ${message.id}`);
        } else {
          if (result.retryAfter) {
            message.nextAttemptTime = new Date(Date.now() + result.retryAfter * 1000);
            message.retryCount++;
            this.sortQueue();
            this.metrics.increment('telegram.queue.messages.ratelimited');
            this.logger.warn(`Rate limited, retry after ${result.retryAfter}s`);
            break;
          } else if (message.retryCount < this.config.maxRetries) {
            message.retryCount++;
            message.nextAttemptTime = new Date(Date.now() + this.getBackoffDelay(message.retryCount));
            this.sortQueue();
            this.metrics.increment('telegram.queue.messages.retried');
            this.logger.warn(`Message ${message.id} failed, retry ${message.retryCount}/${this.config.maxRetries}`);
          } else {
            this.queue.shift(); // Remove failed message
            this.metrics.increment('telegram.queue.messages.failed');
            this.logger.error(`Message ${message.id} failed after ${this.config.maxRetries} retries`);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error processing queue:', error as Error);
      this.metrics.increment('telegram.queue.errors');
    } finally {
      this.processing = false;
      this.logger.debug('Queue processing finished');
    }
  }

  private async canSendMessage(): Promise<boolean> {
    const now = new Date();
    if (now.getTime() - this.windowStartTime.getTime() > this.config.rateLimitWindowMs) {
      this.resetWindow();
      return true;
    }
    return this.messagesSentInWindow < this.config.maxMessagesPerWindow;
  }

  private resetWindow(): void {
    this.windowStartTime = new Date();
    this.messagesSentInWindow = 0;
  }

  private getBackoffDelay(retryCount: number): number {
    return Math.min(
      this.config.baseDelayMs * Math.pow(2, retryCount - 1),
      30000 // Max 30 seconds
    );
  }

  private async sendMessage(message: QueuedMessage): Promise<SendMessageResult> {
    try {
      return await this.messageSender.sendMessage(
        message.chatId,
        message.content,
        { ...message.messageOptions, message_thread_id: message.threadId }
      );
    } catch (error) {
      return { success: false, error: error as TelegramError };
    }
  }

  private isTelegramError(error: any): error is TelegramError {
    return error?.response?.statusCode !== undefined && error?.code !== undefined;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getMetrics(): TelegramQueueMetrics {
    const totalMessages = this.metrics.getValue('telegram.queue.messages.sent') +
                         this.metrics.getValue('telegram.queue.messages.failed');
    
    return {
      queueLength: this.queue.length,
      processingTime: this.metrics.getValue('telegram.queue.processing_time'),
      successRate: totalMessages ? (this.metrics.getValue('telegram.queue.messages.sent') / totalMessages) * 100 : 100,
      failureRate: totalMessages ? (this.metrics.getValue('telegram.queue.messages.failed') / totalMessages) * 100 : 0,
      rateLimitHits: this.metrics.getValue('telegram.queue.messages.ratelimited'),
      averageRetryCount: this.metrics.getValue('telegram.queue.messages.retried') / 
                        (this.metrics.getValue('telegram.queue.messages.sent') || 1)
    };
  }

  async clearQueue(): Promise<void> {
    this.queue = [];
    this.logger.info('Queue cleared');
  }

  pauseProcessing(): void {
    this.paused = true;
    this.logger.info('Queue processing paused');
  }

  resumeProcessing(): void {
    this.paused = false;
    this.logger.info('Queue processing resumed');
    if (!this.processing && this.queue.length > 0) {
      this.processQueue().catch(error => {
        this.logger.error('Error processing queue:', error as Error);
      });
    }
  }

  getQueueStatus(): { isProcessing: boolean; isPaused: boolean; currentQueueSize: number; } {
    return {
      isProcessing: this.processing,
      isPaused: this.paused,
      currentQueueSize: this.queue.length
    };
  }
}