import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigManager, ConfigValidation } from './ConfigManager.js';

@injectable()
export class Environment {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager
  ) {
    this.registerValidations();
  }

  private registerValidations(): void {
    const telegramTokenValidation: ConfigValidation<string> = {
      validate: (token: string) => {
        const pattern = /^\d+:[A-Za-z0-9-_]+$/;
        return token.length > 20 && pattern.test(token);
      },
      message: 'Invalid Telegram bot token format',
      example: '123456789:ABCdefGHI-JklMNOpqr_STUvwxYZ',
      required: [
        'Must be obtained from @BotFather',
        'Should contain numbers followed by colon and alphanumeric string'
      ]
    };

    const telegramGroupIdValidation: ConfigValidation<string> = {
      validate: (id: string) => /^-\d+$/.test(id),
      message: 'Invalid Telegram group ID format (should be a negative number)',
      example: '-1001234567890',
      required: [
        'Must be a negative number',
        'Can be obtained by forwarding a message from your group to @getidsbot'
      ]
    };

    const bearerTokenValidation: ConfigValidation<string> = {
      validate: (token: string) => /^[A-Za-z0-9%]+={0,2}$/.test(token),
      message: 'Invalid Twitter bearer token format',
      example: 'AAAAAAAAAAAAAAAAAAAAAxx%3Dxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      required: [
        'Must be obtained from Twitter Developer Portal',
        'Should have "Read" permissions enabled',
        'Must be properly URL-encoded'
      ]
    };

    const rettiwtApiKeyValidation: ConfigValidation<string> = {
      validate: (key: string) => {
        // Check if it's a valid base64 string
        try {
          return /^[A-Za-z0-9+/=]+$/.test(key) && btoa(atob(key)) === key;
        } catch {
          return false;
        }
      },
      message: 'Invalid Rettiwt API key format',
      example: 'a2R0PWs4SHJOQVZ1SnFrRHVWODFGeDNBRFBuVmZTWU12VHZPWEVmZWo1Qjg...',
      required: [
        'Must be obtained using the Rettiwt Auth Helper browser extension',
        'Should be a valid base64-encoded string'
      ]
    };

    // Register validation for both production and staging tokens
    this.configManager.registerValidation('TELEGRAM_BOT_TOKEN', telegramTokenValidation);
    this.configManager.registerValidation('STAGING_TELEGRAM_BOT_TOKEN', {
      ...telegramTokenValidation,
      required: [
        ...telegramTokenValidation.required,
        'Only used for local development'
      ]
    });

    this.configManager.registerValidation('TELEGRAM_GROUP_ID', telegramGroupIdValidation);
    this.configManager.registerValidation('BEARER_TOKEN', bearerTokenValidation);
    this.configManager.registerValidation('RETTIWT_API_KEY', rettiwtApiKeyValidation);
  }

  getTelegramBotToken(): string {
    const isProduction = process.env.NODE_ENV?.toLowerCase() === 'production';
    const token = isProduction ? 'TELEGRAM_BOT_TOKEN' : 'STAGING_TELEGRAM_BOT_TOKEN';
    return this.configManager.getEnvConfig<string>(token);
  }

  validateEnvironment(): void {
    try {
      this.configManager.validateAll();
      this.logger.info('Environment validation successful');
    } catch (error) {
      this.logger.error('Environment validation failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}