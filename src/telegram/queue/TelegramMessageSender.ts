import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { EnhancedCircuitBreaker } from '../../utils/enhancedCircuitBreaker.js';
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
    @inject(TYPES.CircuitBreaker) private circuitBreaker: EnhancedCircuitBreaker,
    @inject('TelegramBotApi') private bot: TelegramBot
  ) {
    this.logger.setComponent('TelegramMessageSender');
    this.logger.info('TelegramMessageSender initialized');
  }

  async sendMessage(
    chatId: number,
    text: string,
    options?: TelegramBot.SendMessageOptions,
    metadata?: TweetMetadata
  ): Promise<SendMessageResult> {
    this.logger.debug(`Attempting to send message to chat ${chatId} with thread ID ${options?.message_thread_id || 'none'}`);
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
      // Ensure message_thread_id is properly set for forum messages
      if (options?.message_thread_id && metadata?.tweet) {
        const [topicName] = getTopicById(Number(options.message_thread_id)) || [];
        const channelName = topicName || 'UNKNOWN_MONITORING';
        const ageInMinutes = this.calculateTweetAge(metadata.tweet.createdAt);
        
        // Add additional logging for redirected tweets
        if (metadata.redirectReason) {
          this.logger.debug(`Sending ${metadata.redirectReason === 'competitor_tweet' ? 'FROM' : 'MENTION'} competitor tweet to consolidated channel`, {
            channelName,
            topicId: options.message_thread_id,
            tweetId: metadata.tweet.id,
            username: metadata.tweet.tweetBy?.userName,
            redirectReason: metadata.redirectReason,
            mentionedCompetitors: metadata.mentionedCompetitors
          });
        } else {
          this.logger.info(`${channelName} (${options.message_thread_id}): @${metadata.tweet.tweetBy?.userName} - ${metadata.tweet.id} [${ageInMinutes}]`);
        }

      }
      
      this.logger.info(`Attempting to send message to Telegram chat ${chatId} with thread ID ${options?.message_thread_id || 'none'}`, {
        textLength: text.length,
        hasOptions: !!options,
        hasTweetMetadata: !!metadata
      });
      
      const message = await this.bot.sendMessage(chatId.toString(), text, options);
      this.logger.info(`Message successfully sent to chat ${chatId}, message ID: ${message.message_id}`, {
        threadId: options?.message_thread_id,
        tweetId: metadata?.tweet?.id || 'unknown'
      });
      
      // Reset rate limit state on successful send
      if (this.rateLimitRetryAfter > 0) {
        this.rateLimitRetryAfter = 0;
      }
      
      return {
        success: true,
        message
      };
    } catch (error) {
      const telegramError = this.handleError(error);
      this.logger.error('Failed to send Telegram message:', telegramError);
      
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
      // Ensure message_thread_id is properly set for forum messages
      if (options?.message_thread_id && metadata?.tweet) {
        const [topicName] = getTopicById(Number(options.message_thread_id)) || [];
        const channelName = topicName || 'UNKNOWN_MONITORING';
        const ageInMinutes = this.calculateTweetAge(metadata.tweet.createdAt);

        this.logger.info(`${channelName} (${options.message_thread_id}): @${metadata.tweet.tweetBy?.userName} - ${metadata.tweet.id} [${ageInMinutes}]`);
      }
      
      const message = await this.bot.sendPhoto(chatId.toString(), photo, options);
      
      // Reset rate limit state on successful send
      if (this.rateLimitRetryAfter > 0) {
        this.rateLimitRetryAfter = 0;
      }
      
      return {
        success: true,
        message
      };
    } catch (error) {
      const telegramError = this.handleError(error);
      this.logger.error('Failed to send Telegram photo', telegramError);
      
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
}