import { injectable, inject } from 'inversify';
import TelegramBotApi from 'node-telegram-bot-api';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { SendMessageResult, TelegramError } from '../types/telegram.js';

export interface ITelegramMessageSender {
  sendMessage(chatId: number, content: string, options: any): Promise<SendMessageResult>;
}

@injectable()
export class TelegramMessageSender implements ITelegramMessageSender {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject('TelegramBotApi') private bot: TelegramBotApi
  ) {}

  async sendMessage(chatId: number, content: string, options: any): Promise<SendMessageResult> {
    try {
      await this.circuitBreaker.execute(async () => {
        await this.bot.sendMessage(chatId, content, options);
      });

      return { success: true };
    } catch (error) {
      if (this.isTelegramError(error)) {
        if (error.response?.statusCode === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          return {
            success: false,
            error,
            retryAfter
          };
        }
        return {
          success: false,
          error
        };
      }
      return {
        success: false,
        error: new Error(error instanceof Error ? error.message : 'Unknown error') as TelegramError
      };
    }
  }

  private isTelegramError(error: any): error is TelegramError {
    return error?.response?.statusCode !== undefined && error?.code !== undefined;
  }
}