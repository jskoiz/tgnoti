import TelegramBotApi from 'node-telegram-bot-api';
import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { FormattedMessage, TelegramBotConfig, TelegramMessage, TweetMessageConfig, TweetFormatter, ITelegramMessageQueue } from '../types/telegram.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TYPES } from '../types/di.js';
import { Environment } from '../config/environment.js';
import { TopicManager } from './TopicManager.js';
import { MessageStorage, StoredMessage } from '../types/messageStorage.js';
import { Tweet } from '../types/twitter.js';
import { ITelegramMessageSender } from '../telegram/TelegramMessageSender.js';
import os from 'os';
import fs from 'fs';

@injectable()
export class TelegramBot {
  private bot: TelegramBotApi;
  private config: TelegramBotConfig;
  private startTime: Date;
  private isInitialized: boolean = false;
  private lockFile: string = 'telegram-bot.lock';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.ConfigManager) configManager: ConfigManager,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.TopicManager) private topicManager: TopicManager,
    @inject(TYPES.MessageStorage) private messageStorage: MessageStorage,
    @inject(TYPES.TweetFormatter) private tweetFormatter: TweetFormatter,
    @inject(TYPES.TelegramMessageQueue) private messageQueue: ITelegramMessageQueue,
    @inject(TYPES.TelegramMessageSender) private messageSender: ITelegramMessageSender
  ) {
    const envConfig = this.environment.getConfig();
    
    if (!envConfig.telegram) {
      throw new Error('Telegram configuration is missing');
    }
    
    this.config = {
      botToken: envConfig.telegram.api.botToken,
      groupId: envConfig.telegram.api.groupId,
      retryAttempts: envConfig.telegram.retry.maxAttempts,
      defaultTopicId: envConfig.telegram.defaultTopicId.toString()
    };
    this.bot = new TelegramBotApi(this.config.botToken, { polling: false });
    this.startTime = new Date();
  }

  async sendTweet(tweet: Tweet, topicId?: string): Promise<void> {
    try {
      const config: TweetMessageConfig = {
        tweet,
        quotedTweet: tweet.quotedTweet,
        showSummarizeButton: tweet.text?.length > 280 || false,
        translationMessage: undefined
      };

      const formattedMessage = this.tweetFormatter.formatMessage(config);
      const buttons = this.tweetFormatter.createMessageButtons(tweet, config);

      await this.queueMessage({
        text: formattedMessage,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons
        },
        disable_web_page_preview: true,
        message_thread_id: topicId ? parseInt(topicId) : undefined
      });
    } catch (error) {
      this.logger.error('Failed to send tweet:', error as Error);
      throw error;
    }
  }

  private async acquireLock(): Promise<boolean> {
    try {
      fs.writeFileSync(this.lockFile, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (error) {
      try {
        const pid = parseInt(fs.readFileSync(this.lockFile, 'utf8'));
        try {
          process.kill(pid, 0);
          return false;
        } catch {
          fs.writeFileSync(this.lockFile, process.pid.toString());
          return true;
        }
      } catch {
        return false;
      }
    }
  }

  async initialize(): Promise<void> {
    const hasLock = await this.acquireLock();
    try {
      await this.circuitBreaker.execute(async () => {
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
          { command: 'user', description: 'Get details about a Twitter user' }
        ]);
        
        this.logger.info('Bot commands registered');
      });

      this.bot.on('message', (msg) => this.handleMessage(msg));
      this.bot.on('polling_error', (error: Error) => this.handlePollingError(error));

      if (!hasLock) {
        this.logger.error('Another instance of the bot is already running');
        process.exit(1);
      }

      this.bot.startPolling();
      this.setupCommands();
      this.isInitialized = true;
    } catch (error) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Telegram API is currently unavailable');
        process.exit(1);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize Telegram bot: ${errorMessage}`);
    }
  }

  private async handleMessage(msg: TelegramMessage): Promise<void> {
    try {
      if (msg?.message_thread_id === 5026) {
        const storedMessage: StoredMessage = {
          ...msg,
          timestamp: new Date().toISOString(),
          topic_id: msg.message_thread_id,
          raw_format: {
            entities: msg.entities,
            formatting_style: msg.entities?.some(e => e.type === 'bold' || e.type === 'italic') 
              ? 'MarkdownV2' 
              : msg.entities?.some(e => e.type === 'code' || e.type === 'pre') 
                ? 'HTML' 
                : 'plain'
          }
        };

        await this.messageStorage.saveMessage(storedMessage);
        this.logger.debug(`Stored message ${msg.message_id} from topic 5026`);
      }
    } catch (error) {
      this.logger.error('Failed to handle message:', error as Error);
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
        await this.queueMessage({
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
          '/user \\[username\\] \\- Get details about a Twitter user',
        ].join('\n');

        await this.queueMessage({
          text: helpText,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true
        });
      } catch (error) {
        this.logger.error('Failed to send help', error as Error);
      }
    });

    this.bot.onText(/\/user (@?\w+)/, async (msg, match) => {
      if (!match) return;
      
      const username = match[1].startsWith('@') ? match[1].substring(1) : match[1];
      
      try {
        this.logger.debug(`Fetching user details for ${username}`);
        const user = await this.twitterClient.getUserDetails(username);
        
        if (!user) {
          await this.queueMessage({
            text: `❌ User @${username} not found`,
            parse_mode: 'MarkdownV2',
            disable_web_page_preview: true,
            message_thread_id: msg?.message_thread_id
          });
          return;
        }

        const escapeMarkdown = (text: string) => {
          return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        };

        const verifiedBadge = user.isVerified ? '✓ ' : '';
        const followersCount = user.followersCount.toLocaleString();
        const followingCount = user.followingCount.toLocaleString();
        const tweetsCount = user.statusesCount.toLocaleString();
        const joinDate = new Date(user.createdAt).toLocaleDateString();
        
        const userInfo = [
          `👤 *${escapeMarkdown(verifiedBadge + user.fullName)}* \\(@${user.userName}\\)`,
          '',
          user.description ? `📝 ${escapeMarkdown(user.description)}` : '',
          '',
          `📊 *Stats:*`,
          `\\- Followers: ${escapeMarkdown(followersCount)}`,
          `\\- Following: ${escapeMarkdown(followingCount)}`,
          `\\- Tweets: ${escapeMarkdown(tweetsCount)}`,
          `\\- Joined: ${escapeMarkdown(joinDate)}`,
        ].join('\n');

        await this.queueMessage({
          text: userInfo,
          parse_mode: 'MarkdownV2',
          disable_web_page_preview: true,
          message_thread_id: msg?.message_thread_id
        });
      } catch (error) {
        this.logger.error(`Failed to get user details for ${username}`, error as Error);
        await this.queueMessage({ text: `❌ Failed to get user details\\. Please try again later\\.`, parse_mode: 'MarkdownV2' });
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
    const queueMetrics = this.messageQueue.getMetrics();
    const queueStatus = this.messageQueue.getQueueStatus();

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
      '',
      '*Message Queue:*',
      `\\- Queue Size: ${queueStatus.currentQueueSize}`,
      `\\- Processing: ${queueStatus.isProcessing ? 'Yes' : 'No'}`,
      `\\- Success Rate: ${queueMetrics.successRate.toFixed(1)}%`,
      `\\- Rate Limit Hits: ${queueMetrics.rateLimitHits}`,
      '',
      `*Uptime:* ${this.getUptime()}`,
      `*IP Addresses:* ${ipAddresses}`,
      '*Last Check:* ' + new Date().toLocaleString().replace(/\./g, '\\.')
    ].join('\n');
  }

  private async queueMessage(message: FormattedMessage): Promise<void> {
    try {
      this.logger.debug(`Attempting to send message to group ${this.config.groupId}`);
      this.logger.debug(`Original message thread ID: ${message?.message_thread_id}`);

      const topicId = await this.topicManager.getTopicId(
        this.bot,
        this.config.groupId,
        (message?.message_thread_id || this.config.defaultTopicId).toString()
      );

      this.logger.debug(`Validated topic ID: ${topicId}`);
      message.message_thread_id = parseInt(topicId);

      // Queue the message
      const queuedMessageId = await this.messageQueue.queueMessage({
        chatId: parseInt(this.config.groupId),
        threadId: message.message_thread_id,
        content: message.text || '',
        messageOptions: {
          parse_mode: message.parse_mode,
          disable_web_page_preview: message.disable_web_page_preview,
          reply_markup: message.reply_markup
        },
        priority: 1 // Default priority
      });

      this.logger.debug(`Message queued with ID: ${queuedMessageId}`);
    } catch (error) {
      this.logger.error('Failed to queue message:', error as Error);
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
    try {
      this.bot.stopPolling();
      this.isInitialized = false;
      fs.unlinkSync(this.lockFile);
    } catch (error) {
      this.logger.error('Error during shutdown:', error as Error);
    }
  }
}
