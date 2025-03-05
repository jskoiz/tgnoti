import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { CircuitBreaker } from '../../utils/circuitBreaker.js';
import { MetricsManager } from '../../core/monitoring/MetricsManager.js';
import {
  QueuedMessage,
  TelegramQueueMetrics,
  TelegramQueueConfig,
  ITelegramMessageQueue,
  ITelegramMessageSender,
  TelegramError
} from '../../types/telegram.js';
import { Storage } from '../../core/storage/storage.js';

@injectable()
export class TelegramMessageQueue implements ITelegramMessageQueue {
  private queue: QueuedMessage[] = [];
  private isProcessing = false;
  private currentDelay: number;
  private isPaused = false;
  private processInterval: NodeJS.Timeout | null = null;
  private lastRateLimitTime: number = 0;
  private consecutiveRateLimits: number = 0;
  private backoffMultiplier: number = 1;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(TYPES.TelegramQueueConfig) private config: TelegramQueueConfig,
    @inject(TYPES.TelegramMessageSender) private sender: ITelegramMessageSender,
    @inject(TYPES.Storage) private storage: Storage
  ) {
    this.logger.setComponent('TelegramMessageQueue');
    this.logger.info('TelegramMessageQueue initialized with config', {
      baseDelayMs: this.config.baseDelayMs,
      maxRetries: this.config.maxRetries
    });
    this.currentDelay = this.config.baseDelayMs;
    this.startProcessing();
  }

  public async queueMessage(message: Omit<QueuedMessage, 'id' | 'firstAttempt' | 'retryCount'>): Promise<string> {
    this.logger.info(`Queueing message for chat ${message.chatId}, thread ${message.threadId}`, {
      tweetId: message.tweetId,
      priority: message.priority
    });
    const id = this.generateMessageId();
    const queuedMessage: QueuedMessage = {
      ...message,
      id,
      retryCount: 0,
      firstAttempt: new Date()
    };

    this.queue.push(queuedMessage);
    this.logger.debug(`Message queued: ${id}`, {
      queueLength: this.queue.length,
      priority: message.priority
    });

    return id;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getMetrics(): TelegramQueueMetrics {
    const totalMessages = this.queue.length;
    const successfulMessages = this.queue.filter(m => m.retryCount === 0).length;
    const failedMessages = totalMessages - successfulMessages;

    return {
      queueLength: totalMessages,
      processingTime: 0, // TODO: Implement processing time tracking
      successRate: totalMessages > 0 ? (successfulMessages / totalMessages) * 100 : 100,
      failureRate: totalMessages > 0 ? (failedMessages / totalMessages) * 100 : 0,
      rateLimitHits: 0, // TODO: Implement rate limit tracking
      averageRetryCount: totalMessages > 0 
        ? this.queue.reduce((sum, msg) => sum + msg.retryCount, 0) / totalMessages 
        : 0
    };
  }

  public async clearQueue(): Promise<void> {
    this.queue = [];
    this.logger.info('Message queue cleared');
  }

  public pauseProcessing(): void {
    this.isPaused = true;
    this.logger.info('Message queue processing paused', {
      currentDelay: this.currentDelay
    });
  }

  public resumeProcessing(): void {
    this.isPaused = false; 
    this.logger.info('Message queue processing resumed');
  }

  public getQueueStatus(): {
    isProcessing: boolean;
    isPaused: boolean;
    currentQueueSize: number;
    currentDelay: number;
  } {
    return {
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      currentQueueSize: this.queue.length,
      currentDelay: this.currentDelay
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private startProcessing(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
    }

    this.logger.info('Starting message queue processing');
    this.processInterval = setInterval(() => {
      if (!this.isPaused && !this.isProcessing && this.queue.length > 0) {
        this.logger.debug('Processing next message from queue', {
          queueLength: this.queue.length,
          isPaused: this.isPaused,
          isProcessing: this.isProcessing
        });
        this.processNextMessage();
      }
    }, 100); // Use a short interval for checking, but actual sending will respect currentDelay

    this.logger.debug('Message queue processing started', {
      checkInterval: 100,
      sendDelay: this.currentDelay
    });
    this.resetBackoff();
  }

  private async processNextMessage(): Promise<void> {
    if (this.queue.length === 0 || this.isPaused) {
      this.logger.debug('Skipping message processing', {
        queueEmpty: this.queue.length === 0,
        isPaused: this.isPaused
      });
      return;
    }

    this.isProcessing = true;
    
    // Apply the current delay before processing
    this.logger.debug(`Waiting ${this.currentDelay}ms before processing next message`);
    await new Promise(resolve => setTimeout(resolve, this.currentDelay));
    
    // If queue is empty after waiting, exit
    if (this.queue.length === 0) {
      this.logger.debug('Queue empty after delay, exiting processing');
      this.isProcessing = false;
      return;
    }
    const message = this.queue[0];

    try {
      this.logger.info(`Processing message: ${message.id}`, {
      });

      const result = await this.sender.sendMessage(
        message.chatId,
        message.content,
        {
          ...message.messageOptions,
          message_thread_id: message.threadId
        },
        // Pass tweet metadata to sender
        message.tweetMetadata
      );
      
      if (result.success) {
        this.queue.shift();
        // Only mark as seen if both tweetId and threadId are present
        if (message.tweetId && message.threadId) {
          this.logger.info(`Message successfully sent to chat thread ID ${message.threadId}`, {
          });
          await this.storage.markSeen(message.tweetId, message.threadId.toString());
        }
        this.logger.debug(`Message ${message.id} sent successfully`);
        
        // Gradually decrease delay on success if we've had rate limits before
        if (this.consecutiveRateLimits > 0) {
          this.decreaseDelay();
        }
      } else {
        throw result.error;
      }
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      // Handle rate limit errors specially
      if (this.isRateLimitError(err)) {
        this.handleRateLimit(err, message);
      } else {
        this.logger.error(`Error processing message ${message.id}:`, err);
      }
      
      message.retryCount++;
      
      if (message.retryCount >= this.config.maxRetries) {
        const logMessage = `Retry count: ${message.retryCount}, Max retries: ${this.config.maxRetries}`;
        this.logger.error(`Message ${message.id} exceeded max retries, removing from queue`, new Error(logMessage));
        this.queue.shift();
      } else if (this.isRateLimitError(err)) {
        // Move the rate-limited message to the end of the queue to try other messages
        const rateLimitedMessage = this.queue.shift();
        if (rateLimitedMessage) {
          this.queue.push(rateLimitedMessage);
          this.logger.debug(`Rate-limited message ${rateLimitedMessage.id} moved to end of queue`, {
            queueLength: this.queue.length
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
  
  private isRateLimitError(error: Error): boolean {
    return error.message.includes('429') || 
           error.message.includes('Too Many Requests') || 
           error.message.toLowerCase().includes('rate limit');
  }
  
  private handleRateLimit(error: Error, message: QueuedMessage): void {
    const now = Date.now();
    this.lastRateLimitTime = now;
    this.consecutiveRateLimits++;
    
    // Extract retry-after value if available
    let retryAfter = 0;
    const match = error.message.match(/retry after (\d+)/i);
    if (match && match[1]) {
      retryAfter = parseInt(match[1], 10) * 1000; // Convert to milliseconds
      if (retryAfter > 0) {
        const logMessage = `Message ID: ${message.id}, Retry count: ${message.retryCount}, Retry after: ${retryAfter/1000}s`;
        this.logger.warn(`Rate limit hit, Telegram suggests waiting ${retryAfter/1000}s`, new Error(logMessage));
        
        // Apply exponential backoff with the retry-after value as a minimum
        this.increaseDelay(Math.max(retryAfter, this.currentDelay * 2));
        return;
      }
    }
    
    // If no retry-after value found, use exponential backoff
    this.increaseDelay();
    
    const logMessage = `Message ID: ${message.id}, Retry count: ${message.retryCount}, New delay: ${this.currentDelay}ms, Consecutive rate limits: ${this.consecutiveRateLimits}`;
    this.logger.warn(`Rate limit hit, applying exponential backoff`, new Error(logMessage));
  }
  
  private increaseDelay(specificDelay?: number): void {
    if (specificDelay) {
      this.currentDelay = specificDelay;
    } else {
      // Exponential backoff: double the delay each time
      const maxDelay = 60000; // Default max delay of 60 seconds
      this.currentDelay = Math.min(
        this.currentDelay * 2,
        maxDelay
      );
    }
    this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 8);
    
    this.logger.info(`Increased message sending delay`, {
      newDelay: this.currentDelay,
      backoffMultiplier: this.backoffMultiplier
    });
  }
  
  private decreaseDelay(): void {
    // Only decrease if we've gone at least 10 seconds without a rate limit
    const now = Date.now();
    if (now - this.lastRateLimitTime < 10000) {
      return;
    }
    
    this.consecutiveRateLimits = Math.max(0, this.consecutiveRateLimits - 1);
    
    if (this.consecutiveRateLimits === 0) {
      this.backoffMultiplier = Math.max(1, this.backoffMultiplier / 2);
      this.currentDelay = Math.max(
        this.config.baseDelayMs,
        this.currentDelay / 2
      );
      
      this.logger.debug(`Decreased message sending delay`, {
        newDelay: this.currentDelay,
        backoffMultiplier: this.backoffMultiplier
      });
    }
  }
  
  private resetBackoff(): void {
    this.currentDelay = this.config.baseDelayMs;
    this.backoffMultiplier = 1;
    this.consecutiveRateLimits = 0;
    this.lastRateLimitTime = 0;
    
    this.logger.debug(`Reset rate limit backoff`, {
      baseDelay: this.config.baseDelayMs
    });
  }
  
  public clearRateLimitState(): void {
    this.resetBackoff();
    this.logger.info(`Cleared rate limit state`, {
      queueSize: this.queue.length
    });
  }
  
  public removeFailedMessages(): number {
    const initialSize = this.queue.length;
    this.queue = this.queue.filter(msg => msg.retryCount === 0);
    const removedCount = initialSize - this.queue.length;
    
    if (removedCount > 0) {
      this.logger.info(`Removed ${removedCount} failed messages from queue`, {
        newQueueSize: this.queue.length
      });
    }
    
    return removedCount;
  }
  
  public prioritizeQueue(): void {
    // Sort queue by priority (higher number = higher priority)
    this.queue.sort((a, b) => b.priority - a.priority);
    this.logger.debug(`Queue prioritized by message priority`, {
      queueSize: this.queue.length
    });
  }
}