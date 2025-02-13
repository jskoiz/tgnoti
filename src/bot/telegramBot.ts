import TelegramBotApi from 'node-telegram-bot-api';
import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { FormattedMessage, TelegramBotConfig, TelegramMessage } from '../types/telegram.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { MessageFormatter } from './messageFormatter.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TYPES } from '../types/di.js';
import os from 'os';

@injectable()
export class TelegramBot {
  private bot: TelegramBotApi;
  private config: TelegramBotConfig;
  private startTime: Date;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.ConfigManager) configManager: ConfigManager,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker
  ) {
    const botToken = configManager.getEnvConfig<string>('TELEGRAM_BOT_TOKEN');
    const groupId = configManager.getEnvConfig<string>('TELEGRAM_GROUP_ID');
    
    if (!botToken || !groupId) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_ID environment variables are required');
    }
    
    this.config = {
      botToken, groupId, retryAttempts: 3, defaultTopicId: 'default'
    };
    this.bot = new TelegramBotApi(botToken, { polling: true }); // Start with polling enabled
    this.startTime = new Date();
  }

  async initialize(): Promise<void> {
    try {
      // Test bot token validity using circuit breaker
      await this.circuitBreaker.execute(async () => {
        const me = await this.bot.getMe();
        this.logger.info(`Connected as @${me.username}`);
        
        // Register bot commands
        await this.bot.setMyCommands([
          { command: 'status', description: 'Check system status' },
          { command: 'help', description: 'Show help message' },
          { command: 'affiliate', description: 'Show affiliated accounts for @trojanonsolana' }
        ]);
        
        this.logger.info('Bot commands registered');
      });

      // Setup error handler
      this.bot.on('polling_error', (error: Error) => this.handlePollingError(error));
      
      // Setup commands
      this.setupCommands();
    } catch (error) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Telegram API is currently unavailable');
        process.exit(1);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Telegram bot: ${errorMessage}`);
    }
  }

  private handlePollingError(error: Error): void {
    const errorMessage = error.message.toLowerCase();
    
    if (errorMessage.includes('404')) {
      this.logger.error('Invalid bot token. Please check TELEGRAM_BOT_TOKEN');
      process.exit(1);
    }
    
    if (errorMessage.includes('401')) {
      this.logger.error('Unauthorized. Please check bot permissions');
      process.exit(1);
    }
    
    if (errorMessage.includes('forbidden')) {
      this.logger.error('Bot is forbidden from sending messages. Please check group permissions');
      process.exit(1);
    }
    
    this.logger.warn('Polling error:', error);
  }

  private setupCommands(): void {
    this.bot.onText(/\/status/, async (msg) => {
      try {
        this.logger.debug('Received /status command');
        const status = await this.getStatus();
        await this.sendMessage({
          text: status,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true
        });
      } catch (error) {
        this.logger.error('Failed to send status', error as Error);
      }
    });

    this.bot.onText(/\/help/, async (msg) => {
      try {
        this.logger.debug('Received /help command');
        const helpText = [
          '*Available Commands*',
          '',
          '/status \\- Check system status',
          '/help \\- Show this help message',
          '/affiliate \\- Show affiliated accounts for @trojanonsolana',
        ].join('\n');

        await this.sendMessage({
          text: helpText,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true
        });
      } catch (error) {
        this.logger.error('Failed to send help', error as Error);
      }
    });

    this.bot.onText(/^\/affiliate$/, async (msg) => {
      this.logger.debug(`Received /affiliate command: ${JSON.stringify(msg)}`);
      try {
        const username = 'trojanonsolana'; // Hardcoded as per requirements
        this.logger.debug(`Command received from: ${msg.from?.username}`);
        this.logger.debug(`Fetching affiliates for @${username}`);

        const affiliates = await this.twitterClient.getAffiliatedAccounts(username);
        const message = MessageFormatter.formatAffiliateList(username, affiliates);

        // Send to topic 5026
        await this.sendMessage({
          ...message,
          message_thread_id: 5026
        });

      } catch (error) {
        this.logger.error('Failed to fetch affiliates', error as Error);
        await this.sendMessage({ 
          text: '❌ Failed to fetch affiliated accounts\\. Please try again later\\.',
          parse_mode: 'MarkdownV2',
          message_thread_id: 5026,
          disable_web_page_preview: true
        });
      }
    });
  }

  private getIpAddresses(): string {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];
    
    for (const [name, netInterface] of Object.entries(interfaces)) {
      if (!netInterface) continue;
      
      for (const addr of netInterface) {
        if (addr.family === 'IPv4' && !addr.internal) {
          addresses.push(`${name}: ${addr.address.replace(/\./g, '\\.')}`);
        }
      }
    }
    
    return addresses.join('\\, ');
  }

  private getUptime(): string {
    const uptime = new Date().getTime() - this.startTime.getTime();
    const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${days}d ${hours}h ${minutes}m`;
  }

  private async getStatus(): Promise<string> {
    const circuitStatus = this.circuitBreaker.getStatus();
    const serviceStatus = !circuitStatus.isOpen ? '🟢 Running' : '🔴 Degraded';
    const ipAddresses = this.getIpAddresses();
    const uptime = this.getUptime();

    return [
      '🤖 *System Status*',
      '',
      '*Monitoring Topics:*',
      '\\- Trojan Monitor \\(381\\)',
      '\\- Competitor Monitor \\(377\\)',
      '\\- Competition Tweets \\(885\\)',
      '\\- KOL Monitor \\(377\\)',
      '',
      `*Service Status:* ${serviceStatus}`,
      `*API Health:* ${circuitStatus.failures} recent failures`,
      `*Uptime:* ${uptime}`,
      `*IP Addresses:* ${ipAddresses}`,
      '*Last Check:* ' + new Date().toLocaleString().replace(/\./g, '\\.')
    ].join('\n');
  }

  async sendMessage(message: FormattedMessage): Promise<void> {
    const maxRetries = this.config.retryAttempts;
    let lastError: Error | null = null;

    let messageThreadId = message.message_thread_id || parseInt(this.config.defaultTopicId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.circuitBreaker.execute(async () => {
          this.logger.debug(`Sending message to group ${this.config.groupId} in topic ${messageThreadId}`);
          if (message.photo) {
            this.logger.debug('Sending photo message');
            await this.bot.sendPhoto(this.config.groupId, message.photo, {
              caption: message.caption,
              parse_mode: message.parse_mode,
              message_thread_id: messageThreadId
            });
          } else {
            this.logger.debug('Sending text message');
            await this.bot.sendMessage(this.config.groupId, message.text!, {
              parse_mode: message.parse_mode,
              message_thread_id: messageThreadId,
              disable_web_page_preview: message.disable_web_page_preview !== false
            });
          }
          this.logger.debug('Message sent successfully');
        });
        return;
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Circuit breaker is open') {
          this.logger.error('Telegram API is currently unavailable');
          throw error; // Propagate circuit breaker error to allow queue retry
        }

        const errorMessage = error instanceof Error 
          ? error.message 
          : 'Unknown error occurred';
        
        // Check for authentication/permission errors
        if (errorMessage.toLowerCase().includes('unauthorized') || 
            errorMessage.toLowerCase().includes('forbidden')) {
          this.logger.error('Authentication error:', error instanceof Error ? error : new Error(errorMessage));
          process.exit(1);
        }

        // Handle message formatting errors
        if (errorMessage.toLowerCase().includes('can\'t parse entities')) {
          this.logger.error('Message formatting error:', error instanceof Error ? error : new Error(errorMessage));
          // Don't retry on formatting errors as they will keep failing
          throw error;
        }

        // If topic not found and we're not already using default topic, try with default
        if (errorMessage.toLowerCase().includes('thread not found') && 
            messageThreadId !== parseInt(this.config.defaultTopicId)) {
          this.logger.warn(`Topic ${messageThreadId} not found, falling back to default topic ${this.config.defaultTopicId}`);
          messageThreadId = parseInt(this.config.defaultTopicId);
          continue; // Try again with default topic
        }
        
        lastError = error instanceof Error ? error : new Error(errorMessage);
        this.logger.warn(`Telegram send attempt ${attempt} failed: ${errorMessage}`);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.logger.error(`Failed to send message after ${maxRetries} attempts`, lastError!);
  }

  getCircuitBreakerStatus(): { failures: number; isOpen: boolean } {
    return this.circuitBreaker.getStatus();
  }

  async stop(): Promise<void> {
    this.bot.stopPolling();
  }
}
