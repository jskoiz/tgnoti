import TelegramBotApi from 'node-telegram-bot-api';
import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { FormattedMessage, TelegramBotConfig, TelegramMessage } from '../types/telegram.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { MessageFormatter } from './messageFormatter.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TYPES, AFFILIATE_TYPES } from '../types/di.js';
import { IAffiliateMonitor } from '../types/affiliate.js';
import { Environment } from '../config/environment.js';
import { TopicManager } from './TopicManager.js';
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
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(AFFILIATE_TYPES.AffiliateMonitor) private affiliateMonitor: IAffiliateMonitor,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.TopicManager) private topicManager: TopicManager
  ) {
    const botToken = this.environment.getTelegramBotToken();
    const groupId = configManager.getEnvConfig<string>('TELEGRAM_GROUP_ID');
    
    if (!botToken || !groupId) {
      throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_ID environment variables are required');
    }
    
    this.config = {
      botToken, groupId, retryAttempts: 3, defaultTopicId: 'default'
    };
    this.bot = new TelegramBotApi(botToken, { polling: true });
    this.startTime = new Date();
  }

  async initialize(): Promise<void> {
    try {
      await this.circuitBreaker.execute(async () => {
        // Verify bot admin status
        const isAdmin = await this.verifyBotAdmin();
        if (!isAdmin) {
          this.logger.error('Bot is not an admin in the group. Please grant admin privileges.');
          throw new Error('Bot requires admin privileges');
        }

        const me = await this.bot.getMe();
        this.logger.info(`Connected as @${me.username}`);
        
        await this.bot.setMyCommands([
          { command: 'status', description: 'Check system status' },
          { command: 'help', description: 'Show help message' },
          { command: 'track_affiliates', description: 'Start tracking organization affiliates' },
          { command: 'untrack_affiliates', description: 'Stop tracking organization affiliates' },
          { command: 'list_affiliates', description: 'Show current affiliates for an organization' },
          { command: 'affiliate_status', description: 'Show affiliate tracking status' }
        ]);
        
        this.logger.info('Bot commands registered');
      });

      this.bot.on('polling_error', (error: Error) => this.handlePollingError(error));
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
    // Existing commands
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
          '/track\\_affiliates @org \\- Start tracking organization affiliates',
          '/untrack\\_affiliates @org \\- Stop tracking organization affiliates',
          '/list\\_affiliates @org \\- Show current affiliates for an organization',
          '/affiliate\\_status \\- Show affiliate tracking status',
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

    // New affiliate tracking commands
    this.bot.onText(/\/track_affiliates (@\w+)/, async (msg, match) => {
      if (!match) return;
      const orgUsername = match[1].substring(1); // Remove @ symbol
      
      try {
        await this.affiliateMonitor.startMonitoring(orgUsername);
        await this.sendMessage({
          text: `✅ Started tracking affiliates for @${orgUsername}`,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      } catch (error) {
        this.logger.error(`Failed to start tracking ${orgUsername}`, error as Error);
        await this.sendMessage({
          text: `❌ Failed to start tracking @${orgUsername}\\. Error: ${(error as Error).message}`,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      }
    });

    this.bot.onText(/\/untrack_affiliates (@\w+)/, async (msg, match) => {
      if (!match) return;
      const orgUsername = match[1].substring(1);
      
      try {
        await this.affiliateMonitor.stopMonitoring(orgUsername);
        await this.sendMessage({
          text: `✅ Stopped tracking affiliates for @${orgUsername}`,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      } catch (error) {
        this.logger.error(`Failed to stop tracking ${orgUsername}`, error as Error);
        await this.sendMessage({
          text: `❌ Failed to stop tracking @${orgUsername}\\. Error: ${(error as Error).message}`,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      }
    });

    this.bot.onText(/\/list_affiliates (@\w+)/, async (msg, match) => {
      if (!match) return;
      const orgUsername = match[1].substring(1);
      
      try {
        const result = await this.affiliateMonitor.checkAffiliates(orgUsername);
        const state = result.cached ? '\\(cached\\)' : '\\(fresh\\)';
        
        const affiliates = result.changes?.added || [];
        const affiliateList = affiliates.length > 0
          ? affiliates.map(a => `@${a}`).join('\\, ')
          : 'No affiliates found';

        await this.sendMessage({
          text: [
            `🔍 *Affiliates for @${orgUsername}* ${state}`,
            '',
            affiliateList
          ].join('\n'),
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      } catch (error) {
        this.logger.error(`Failed to list affiliates for ${orgUsername}`, error as Error);
        await this.sendMessage({
          text: `❌ Failed to list affiliates for @${orgUsername}\\. Error: ${(error as Error).message}`,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      }
    });

    this.bot.onText(/\/affiliate_status/, async (msg) => {
      try {
        const monitoredOrgs = await this.affiliateMonitor.getMonitoredOrgs();
        const status = [
          '📊 *Affiliate Tracking Status*',
          '',
          '*Monitored Organizations:*',
          monitoredOrgs.length > 0
            ? monitoredOrgs.map(org => `@${org}`).join('\\, ')
            : 'No organizations currently monitored',
          '',
          '*Last Check:* ' + new Date().toLocaleString().replace(/\./g, '\\.')
        ].join('\n');

        await this.sendMessage({
          text: status,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
        });
      } catch (error) {
        this.logger.error('Failed to get affiliate status', error as Error);
        await this.sendMessage({
          text: '❌ Failed to get affiliate tracking status\\. Please try again later\\.',
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: 5026
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
    const monitoredOrgs = await this.affiliateMonitor.getMonitoredOrgs();

    return [
      '🤖 *System Status*',
      '',
      '*Monitoring Topics:*',
      '\\- Trojan Monitor \\(381\\)',
      '\\- Competitor Monitor \\(377\\)',
      '\\- Competition Tweets \\(885\\)',
      '\\- KOL Monitor \\(377\\)',
      '',
      '*Affiliate Tracking:*',
      `\\- Monitored Organizations: ${monitoredOrgs.length}`,
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
    
    try {
      // Get appropriate topic ID with fallback handling
      const topicId = await this.topicManager.getTopicId(
        this.bot,
        this.config.groupId,
        (message.message_thread_id || this.config.defaultTopicId).toString()
      );

      // Update message with validated topic ID
      message.message_thread_id = parseInt(topicId);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.circuitBreaker.execute(async () => {
          this.logger.debug(`Sending message to group ${this.config.groupId} in topic ${message.message_thread_id}`);
          if (message.photo) {
            this.logger.debug('Sending photo message');
            await this.bot.sendPhoto(this.config.groupId, message.photo, {
              caption: message.caption,
              parse_mode: message.parse_mode,
              message_thread_id: message.message_thread_id
            });
          } else {
            this.logger.debug('Sending text message');
            await this.bot.sendMessage(this.config.groupId, message.text!, {
              parse_mode: message.parse_mode,
              message_thread_id: message.message_thread_id,
              disable_web_page_preview: true
            });
          }
          this.logger.debug('Message sent successfully');
        });
        return;
      } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Circuit breaker is open') {
          this.logger.error('Telegram API is currently unavailable');
          throw error;
        }

        const errorMessage = error instanceof Error 
          ? error.message 
          : 'Unknown error occurred';
        
        if (errorMessage.toLowerCase().includes('unauthorized') || 
            errorMessage.toLowerCase().includes('forbidden')) {
          this.logger.error('Authentication error:', error instanceof Error ? error : new Error(errorMessage));
          process.exit(1);
        }

        if (errorMessage.toLowerCase().includes('can\'t parse entities')) {
          this.logger.error('Message formatting error:', error instanceof Error ? error : new Error(errorMessage));
          throw error;
        }

        
        lastError = error instanceof Error ? error : new Error(errorMessage);
        this.logger.warn(`Telegram send attempt ${attempt} failed: ${errorMessage}`);
        
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to send message after all retries');
    } catch (error) {
      this.logger.error('Failed to send message:', error as Error);
      throw error;
    }
}

  private verifyBotAdmin = async (): Promise<boolean> => {
    try {
      const chatAdmins = await this.bot.getChatAdministrators(this.config.groupId);
      const botInfo = await this.bot.getMe();
      const botAdmin = chatAdmins.find(admin => admin.user.id === botInfo.id);
      return !!botAdmin;
    } catch (error) {
      this.logger.error('Failed to verify bot admin status:', error instanceof Error ? error : new Error('Unknown error'));
      return false;
    }
  }

  getCircuitBreakerStatus(): { failures: number; isOpen: boolean } {
    return this.circuitBreaker.getStatus();
  }

  async stop(): Promise<void> {
    this.bot.stopPolling();
  }
}
