import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { CircuitBreaker } from '../../utils/circuitBreaker.js';
import { SendMessageResult, TelegramError, ITelegramMessageSender, TweetMetadata } from '../../types/telegram.js';
import { LogLevel } from '../../logging/LogService.js';
import { getTopicById, TOPIC_CONFIG } from '../../config/topicConfig.js';
import TelegramBot from 'node-telegram-bot-api';

@injectable()
export class TelegramMessageSender implements ITelegramMessageSender {
  private lastRateLimitTime: number = 0;
  private rateLimitRetryAfter: number = 0;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject('TelegramBotApi') private bot: TelegramBot
  ) {
    this.logger.setComponent('TelegramMessageSender');
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramBot.SendMessageOptions,
    metadata?: TweetMetadata
  ): Promise<SendMessageResult> {
    // Check if we're currently rate limited
    const now = Date.now();
    if (this.rateLimitRetryAfter > 0 && now < this.lastRateLimitTime + this.rateLimitRetryAfter) {
      const waitTime = (this.lastRateLimitTime + this.rateLimitRetryAfter - now) / 1000;
      const error = new Error(`ETELEGRAM: 429 Too Many Requests: retry after ${Math.ceil(waitTime)}`);
      this.logger.warn(`Rate limit in effect, need to wait ${waitTime.toFixed(1)}s before sending`, error);
      
      return {
        success: false,
        error: this.handleError(error),
        retryAfter: Math.ceil(waitTime) * 1000
      };
    }

    try {
      this.logger.logObject('debug', 'Attempting to send Telegram message', {
        chatId,
        messageLength: text.length,
        hasOptions: !!options,
        threadId: options?.message_thread_id
      });
      
      // Ensure message_thread_id is properly set for forum messages
      if (options?.message_thread_id) {
        const logData = {
          topicId: Number(options.message_thread_id),
          topicName: this.getTopicName(Number(options.message_thread_id))
        };

        if (metadata?.tweet) {
          Object.assign(logData, {
            author: `@${metadata.tweet.tweetBy?.userName}`,
            tweetId: metadata.tweet.id,
            matchReason: this.getMatchReason(metadata),
            tweetText: metadata.tweet.text?.substring(0, 50) + (metadata.tweet.text?.length || 0 > 50 ? '...' : ''),
            url: `https://x.com/${metadata.tweet.tweetBy?.userName}/status/${metadata.tweet.id}`
          });
        }

        this.logger.logStructured({
          timestamp: new Date().toISOString(),
          level: LogLevel.INFO,
          component: this.constructor.name,
          message: metadata?.tweet
            ? `${this.getTopicName(Number(options.message_thread_id))} (${options.message_thread_id}): @${metadata.tweet.tweetBy?.userName} - ${metadata.tweet.id} [${this.calculateTweetAge(metadata.tweet.createdAt)}]`
            : `${this.getTopicName(Number(options.message_thread_id))} (${options.message_thread_id}): No tweet data`,
          data: logData,
          correlationId: undefined
        });
      }
      
      const message = await this.bot.sendMessage(chatId.toString(), text, options);

      this.logger.logObject('debug', 'Message sent successfully', { messageId: message.message_id });
      
      // Reset rate limit state on successful send
      if (this.rateLimitRetryAfter > 0) {
        this.rateLimitRetryAfter = 0;
        this.logger.debug('Rate limit state reset after successful message');
      }
      
      return {
        success: true,
        message
      };
    } catch (error) {
      const telegramError = this.handleError(error);
      this.logger.error('Failed to send Telegram message:', telegramError);
      this.logger.logObject('error', 'Error details', {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error)
      });
      
      // Update rate limit state if this is a rate limit error
      const retryAfter = this.getRetryAfter(telegramError);
      if (retryAfter && telegramError.code === '429') {
        this.lastRateLimitTime = Date.now();
        this.rateLimitRetryAfter = retryAfter;
        this.logger.warn(`Rate limit hit, setting retry after to ${retryAfter/1000}s`, new Error(`Rate limit retry after: ${retryAfter/1000}s`));
      }
      
      return {
        success: false,
        error: telegramError,
        retryAfter
      };
    }
  }

  async sendPhoto(
    chatId: number,
    photo: string,
    options?: TelegramBot.SendPhotoOptions,
    metadata?: TweetMetadata
  ): Promise<SendMessageResult> {
    // Check if we're currently rate limited
    const now = Date.now();
    if (this.rateLimitRetryAfter > 0 && now < this.lastRateLimitTime + this.rateLimitRetryAfter) {
      const waitTime = (this.lastRateLimitTime + this.rateLimitRetryAfter - now) / 1000;
      const error = new Error(`ETELEGRAM: 429 Too Many Requests: retry after ${Math.ceil(waitTime)}`);
      this.logger.warn(`Rate limit in effect, need to wait ${waitTime.toFixed(1)}s before sending photo`, error);
      
      return {
        success: false,
        error: this.handleError(error),
        retryAfter: Math.ceil(waitTime) * 1000
      };
    }

    try {
      this.logger.logObject('debug', 'Attempting to send Telegram photo', {
        chatId,
        hasOptions: !!options,
        threadId: options?.message_thread_id
      });
      
      // Ensure message_thread_id is properly set for forum messages
      if (options?.message_thread_id) {
        const logData = {
          topicId: Number(options.message_thread_id),
          topicName: this.getTopicName(Number(options.message_thread_id)),
        };

        if (metadata?.tweet) {
          Object.assign(logData, {
            author: `@${metadata.tweet.tweetBy?.userName}`,
            tweetId: metadata.tweet.id,
            matchReason: this.getMatchReason(metadata),
            tweetText: metadata.tweet.text?.substring(0, 50) + (metadata.tweet.text?.length || 0 > 50 ? '...' : ''),
            url: `https://x.com/${metadata.tweet.tweetBy?.userName}/status/${metadata.tweet.id}`
          });
        }

        this.logger.logObject('info', '📨 Tweet Routing (with media)', logData);
      }
      this.logger.debug(`Sending message to topic ${options?.message_thread_id}`);
      
      const message = await this.bot.sendPhoto(chatId.toString(), photo, options);

      this.logger.logObject('debug', 'Photo sent successfully', { messageId: message.message_id });
      
      // Reset rate limit state on successful send
      if (this.rateLimitRetryAfter > 0) {
        this.rateLimitRetryAfter = 0;
        this.logger.debug('Rate limit state reset after successful photo send');
      }
      
      return {
        success: true,
        message
      };
    } catch (error) {
      const telegramError = this.handleError(error);
      this.logger.error('Failed to send Telegram photo', telegramError);
      this.logger.logObject('error', 'Error details', {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error)
      });
      
      // Update rate limit state if this is a rate limit error
      const retryAfter = this.getRetryAfter(telegramError);
      if (retryAfter && telegramError.code === '429') {
        this.lastRateLimitTime = Date.now();
        this.rateLimitRetryAfter = retryAfter;
        this.logger.warn(`Rate limit hit, setting retry after to ${retryAfter/1000}s`, new Error(`Rate limit retry after: ${retryAfter/1000}s`));
      }
      
      return {
        success: false,
        error: telegramError,
        retryAfter
      };
    }
  }

  private handleError(error: unknown): TelegramError {
    if (error instanceof Error) {
      const telegramError = error as TelegramError;
      telegramError.code = this.getErrorCode(error);
      
      // Extract retry-after from error message if not in headers
      if (telegramError.code === '429' && !telegramError.response?.headers?.['retry-after']) {
        const match = error.message.match(/retry after (\d+)/i);
        if (match && match[1]) {
          if (!telegramError.response) {
            telegramError.response = {
              statusCode: 429,
              body: {},
              headers: {}
            };
          } else if (!telegramError.response.headers) {
            telegramError.response.headers = {};
          }
          
          telegramError.response.headers['retry-after'] = match[1];
        }
      }
      
      return telegramError;
    }

    return {
      name: 'TelegramError',
      message: String(error),
      code: 'UNKNOWN_ERROR'
    };
  }

  private getErrorCode(error: Error): string {
    const message = error.message.toLowerCase();
    
    if (message.includes('too many requests') || message.includes('429')) return '429';
    if (message.includes('forbidden')) return '403';
    if (message.includes('not found')) return '404';
    if (message.includes('bad request')) return '400';
    
    return 'UNKNOWN_ERROR';
  }

  private getRetryAfter(error: TelegramError): number | undefined {
    // First check if retry-after is in the headers
    if (error.response?.headers?.['retry-after']) {
      const retrySeconds = parseInt(error.response.headers['retry-after'], 10);
      return retrySeconds * 1000; // Convert to milliseconds
    }
    
    // If not in headers, try to extract from error message
    if (error.message) {
      const match = error.message.match(/retry after (\d+)/i);
      if (match && match[1]) {
        const retrySeconds = parseInt(match[1], 10);
        return retrySeconds * 1000; // Convert to milliseconds
      }
    }
    
    // Default retry time if we know it's a rate limit but don't have a specific time
    if (error.code === '429') {
      return 30000; // Default to 30 seconds
    }
    
    return undefined;
  }

  private calculateTweetAge(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (minutes < 1440) { // Less than 24 hours
      return `${Math.floor(minutes / 60)}h ago`;
    } else {
      return `${Math.floor(minutes / 1440)}d ago`;
    }
  }

  /**
   * Get the human-readable topic name from a topic ID
   */
  private getTopicName(topicId: number): string {
    const topic = getTopicById(topicId);
    const topicName = topic?.[0];
    return topicName || 'Unknown Topic';
  }

  /**
   * Determine why a tweet was matched to a topic
   */
  private getMatchReason(metadata: TweetMetadata): string {
    if (!metadata.tweet?.tweetBy?.userName) {
      return 'Unknown match reason';
    }

    // Check for username match
    if (metadata.tweet.tweetBy.userName.toLowerCase() === metadata.matchedTopic?.toLowerCase()) {
      return `Username match: @${metadata.tweet.tweetBy.userName}`;
    }

    // Check for content match
    if (metadata.tweet.text?.toLowerCase().includes(metadata.matchedTopic?.toLowerCase() || '')) {
      return `Content match: "${metadata.matchedTopic}"`;
    }
    return 'Unknown match reason';
  }
}