import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { Environment } from '../../config/environment.js';
import TelegramBotApi from 'node-telegram-bot-api';

@injectable()
export class TelegramBotService {
  private bot: TelegramBotApi;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Environment) private environment: Environment
  ) {
    const config = this.environment.getConfig();
    if (!config.telegram) {
      throw new Error('Telegram configuration is missing');
    }
    
    this.bot = new TelegramBotApi(config.telegram.api.botToken, { 
      polling: false, // Disable automatic polling to prevent conflicts
      filepath: false,
      baseApiUrl: 'https://api.telegram.org',
      testEnvironment: false
    });
    this.logger.info('TelegramBotService initialized with polling disabled');
  }

  getBot(): TelegramBotApi {
    return this.bot;
  }
}