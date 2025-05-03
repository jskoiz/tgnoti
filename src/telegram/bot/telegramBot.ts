import TelegramBotApi from 'node-telegram-bot-api';
import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { FormattedMessage, TelegramBotConfig, TelegramMessage, TweetMessageConfig, TweetFormatter, ITelegramMessageQueue, QueuedMessage, ITelegramMessageSender, TweetMetadata } from '../../types/telegram.js';
import { FilterType, TopicFilter } from '../../types/filters.js';
import { EnhancedCircuitBreaker } from '../../utils/enhancedCircuitBreaker.js';
import { TwitterClient } from '../../core/twitter/twitterClient.js';
import { TYPES } from '../../types/di.js';
import { Environment } from '../../config/environment.js';
import { TopicManager } from './TopicManager.js';
import { MessageStorage, StoredMessage } from '../types/messageStorage.js';
import { Tweet } from '../../types/twitter.js';
import { TopicFilterManager } from './TopicFilterManager.js';
import { FilterCommandHandler } from './FilterCommandHandler.js';
import { AffiliateTrackingService } from '../../services/AffiliateTrackingService.js';
import { TwitterAffiliateService } from '../../services/TwitterAffiliateService.js';
import os from 'os';
import fs from 'fs';

@injectable()
export class TelegramBot {
  private config: TelegramBotConfig;
  private startTime: Date;
  private isInitialized: boolean = false;
  private lockFile: string = 'telegram-bot.lock';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject('TelegramBotApi') private telegramBot: TelegramBotApi,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: EnhancedCircuitBreaker,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.TopicManager) private topicManager: TopicManager,
    @inject(TYPES.MessageStorage) private messageStorage: MessageStorage,
    @inject(TYPES.TweetFormatter) private tweetFormatter: TweetFormatter,
    @inject(TYPES.TelegramMessageQueue) private messageQueue: ITelegramMessageQueue,
    @inject(TYPES.TelegramMessageSender) private messageSender: ITelegramMessageSender,
    @inject(TYPES.TopicFilterManager) private topicFilterManager: TopicFilterManager,
    @inject(TYPES.FilterCommandHandler) private filterCommandHandler: FilterCommandHandler,
    @inject(TYPES.AffiliateTrackingService) private affiliateTrackingService: AffiliateTrackingService,
    @inject(TYPES.TwitterAffiliateService) private twitterAffiliateService: TwitterAffiliateService
  ) {
    this.logger.setComponent('TelegramBot');
    this.logger.info('TelegramBot constructor called');
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
    this.startTime = new Date();
  }

  async sendTweet(tweet: Tweet, topicId?: string): Promise<void> {
    try {
      this.logger.info(`Attempting to send tweet ${tweet.id} to topic ${topicId || 'default'}`);
      if (!this.isInitialized) {
        this.logger.error('TelegramBot not initialized! Attempting to initialize now...');
        await this.initialize();
      }
      const config: TweetMessageConfig = {
        tweet,
        quotedTweet: tweet.quotedTweet,
        showSummarizeButton: tweet.text?.length > 280 || false,
        translationMessage: undefined
      };

      const formattedMessage = this.tweetFormatter.formatMessage(config);
      const buttons = this.tweetFormatter.createMessageButtons(tweet, config);

      // Create tweet metadata
      const tweetMetadata: TweetMetadata = {
        tweet,
        type: tweet.quotedTweet ? 'quote' : (tweet.replyToTweet ? 'reply' : 'original'),
        matchedTopic: topicId
      };
      
      this.logger.logObject('info', 'Created tweet metadata for sending', {
        tweetId: tweet.id,
        type: tweetMetadata.type,
        matchedTopic: tweetMetadata.matchedTopic,
        hasQuotedTweet: !!tweet.quotedTweet,
        createdAt: tweet.createdAt
      });
      this.logger.setComponent('TelegramBot');

      await this.queueMessage({
        text: formattedMessage,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buttons
        },
        disable_web_page_preview: true,
        message_thread_id: topicId ? parseInt(topicId) : undefined
      },
      tweetMetadata,
      tweet.id);
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
    this.logger.info('TelegramBot initialize method called');
    const hasLock = await this.acquireLock();
    try {
      await this.circuitBreaker.execute(async () => {
        const isAdmin = await this.verifyBotAdmin();
        if (!isAdmin) {
          this.logger.error('Bot is not an admin in the group. Please grant admin privileges.');
          throw new Error('Bot requires admin privileges');
        }

        const me = await this.telegramBot.getMe();
        this.logger.info(`Connected as @${me.username}`);
        
        await this.telegramBot.setMyCommands([
          { command: 'status', description: 'Check system status' },
          { command: 'help', description: 'Show help message' },
          { command: 'user', description: 'Get details about a Twitter user' },
          { command: 'filter', description: 'Manage filters for this topic' },
          { command: 'affiliates', description: 'Show summary of tracked affiliates' },
          { command: 'account', description: 'Show affiliates for a specific account' }
        ]);
        
        this.logger.info('Bot commands registered');
      });

      this.telegramBot.on('message', (msg) => this.handleMessage(msg));
      this.telegramBot.on('polling_error', (error: Error) => this.handlePollingError(error));
      
      // Register the filter command handler
      this.filterCommandHandler.registerHandlers(this.telegramBot);
      
      // Register callback query handler for refresh stats button
      // This needs to be registered after the filter command handler to avoid conflicts
      this.telegramBot.on('callback_query', async (query) => {
        try {
          // Only handle refresh callbacks here, filter callbacks are handled by FilterCommandHandler
          if (query.data && query.data.startsWith('refresh:') && !query.data.startsWith('filter_')) {
            this.logger.info(`Received refresh callback: ${query.data}`);
            await this.handleRefreshCallback(query);
          }
        } catch (error) {
          this.logger.error(`Failed to handle refresh callback: ${error instanceof Error ? error.message : String(error)}`);
          try {
            await this.telegramBot.answerCallbackQuery(query.id, {
              text: 'Failed to refresh stats. Please try again.',
              show_alert: true
            });
          } catch (answerError) {
            this.logger.error(`Failed to answer callback query: ${answerError instanceof Error ? answerError.message : String(answerError)}`);
          }
        }
      });

      if (!hasLock) {
        this.logger.error('Another instance of the bot is already running');
        process.exit(1);
      }

      this.telegramBot.startPolling();
      this.setupCommands();
      this.isInitialized = true;
      this.logger.info('TelegramBot successfully initialized');
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
          id: msg.message_id.toString(),
          chatId: msg.chat.id,
          threadId: msg.message_thread_id,
          messageId: msg.message_id,
          content: msg.text || '',
          status: 'pending',
          retryCount: 0,
          timestamp: Date.now()
        };

        await this.messageStorage.saveMessage(storedMessage);
        this.logger.debug(`Stored message ${storedMessage.id} from topic 5026`);
      }
      
      // Handle filter value input for interactive filter management
      await this.filterCommandHandler.handleFilterValueInput(this.telegramBot, msg);
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
    // All filter commands are handled by FilterCommandHandler
    this.telegramBot.onText(/\/status/, async (msg) => {
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

    this.telegramBot.onText(/\/help/, async (msg) => {
      try {
        this.logger.debug('Received /help command');
        const helpText = [
          '*Available Commands*',
          '',
          '*General Commands:*',
          '/status \\- Check system status',
          '/help \\- Show this help message',
          '/user \\[username\\] \\- Get details about a Twitter user',
          '',
          '*Filter Management:*',
          '/filter \\- Open interactive filter management menu',
          '',
          '*Affiliate Tracking:*',
          '/affiliates \\- Show summary of all tracked affiliates',
          '/account \\[username\\] \\- Show affiliates for a specific account',
          '',
          '*Note:* Filter commands only work in topics\\.'
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

    this.telegramBot.onText(/\/user (@?\w+)/, async (msg, match) => {
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

    // Add affiliate commands
    this.telegramBot.onText(/\/affiliates/, async (msg) => {
      try {
        this.logger.debug('Received /affiliates command');
        const summary = await this.affiliateTrackingService.generateAffiliateSummary();
        await this.queueMessage({
          text: summary,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          message_thread_id: msg?.message_thread_id
        });
      } catch (error) {
        this.logger.error('Failed to send affiliates summary', error as Error);
      }
    });
    
    // Support both username and ID formats
    this.telegramBot.onText(/\/account\s+(@?\w+)/, async (msg, match) => {
      if (!match) return;
      
      const userInput = match[1];
      const isUsername = userInput.startsWith('@') || !userInput.match(/^\d+$/);
      
      try {
        this.logger.debug(`Fetching affiliates for ${userInput}`);
        
        let userId = userInput;
        let userName = userInput;
        
        // If username provided, get the user ID first
        if (isUsername) {
          const normalizedUsername = userInput.replace('@', '');
          const user = await this.twitterClient.getUserDetails(normalizedUsername);
          
          if (!user) {
            await this.queueMessage({
              text: `❌ User ${userInput} not found`,
              parse_mode: 'HTML',
              message_thread_id: msg?.message_thread_id
            });
            return;
          }
          
          userId = user.id;
          userName = user.userName;
        }
        
        const affiliates = await this.twitterAffiliateService.getUserAffiliates(userId);
        const formattedMessage = this.affiliateTrackingService.formatAffiliatesList(userName, affiliates);
        
        await this.queueMessage({
          text: formattedMessage,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          message_thread_id: msg?.message_thread_id
        });
      } catch (error) {
        this.logger.error(`Failed to get affiliates for ${userInput}`, error as Error);
        await this.queueMessage({
          text: `❌ Failed to get affiliates. Please try again later.`,
          parse_mode: 'HTML',
          message_thread_id: msg?.message_thread_id
        });
      }
    });
    
    // All filter commands are now handled by FilterCommandHandler
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

  private escapeMarkdownV2(text: string): string {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  private async getStatus(): Promise<string> {
    const circuitStatus = this.circuitBreaker.getStatus();
    const serviceStatus = !circuitStatus.isOpen ? '🟢 Running' : '🔴 Degraded';
    const ipAddresses = this.getIpAddresses();
    const queueMetrics = this.messageQueue.getMetrics();
    const queueStatus = this.messageQueue.getQueueStatus();
    
    // Format the current date with proper escaping for MarkdownV2
    const currentDate = this.escapeMarkdownV2(new Date().toLocaleString());

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
      `\\- Success Rate: ${this.escapeMarkdownV2(queueMetrics.successRate.toFixed(1))}%`,
      `\\- Rate Limit Hits: ${queueMetrics.rateLimitHits}`,
      '',
      `*Uptime:* ${this.escapeMarkdownV2(this.getUptime())}`,
      `*IP Addresses:* ${ipAddresses}`,
      `*Last Check:* ${currentDate}`
    ].join('\n');
  }

  private async queueMessage(message: FormattedMessage, tweetMetadata?: TweetMetadata, tweetId?: string): Promise<void> {
    try {
      this.logger.debug(`Attempting to send message to group ${this.config.groupId}`);
      this.logger.debug(`Original message thread ID: ${message?.message_thread_id}`);

      const topicId = await this.topicManager.getTopicId(
        this.telegramBot,
        this.config.groupId,
        (message?.message_thread_id || this.config.defaultTopicId).toString()
      );

      this.logger.debug(`Validated topic ID: ${topicId}`);
      message.message_thread_id = parseInt(topicId);

      // Queue the message
      const queuedMessageId = await this.messageQueue.queueMessage({
        chatId: parseInt(this.config.groupId),
        threadId: message.message_thread_id,
        tweetId,
        content: message.text || '',
        messageOptions: {
          parse_mode: message.parse_mode,
          disable_web_page_preview: message.disable_web_page_preview,
          reply_markup: message.reply_markup
        },
        priority: 1, // Default priority
        tweetMetadata
      });

      this.logger.debug(`Message queued with ID: ${queuedMessageId}`);
    } catch (error) {
      this.logger.error('Failed to queue message:', error as Error);
      throw error;
    }
  }

  private async verifyBotAdmin(): Promise<boolean> {
    try {
      const chatAdmins = await this.telegramBot.getChatAdministrators(this.config.groupId);
      const botInfo = await this.telegramBot.getMe();
      const botAdmin = chatAdmins.find(admin => admin.user.id === botInfo.id);
      return !!botAdmin;
    } catch (error) {
      this.logger.error('Failed to verify bot admin status:', error instanceof Error ? error : new Error('Unknown error'));
      return false;
    }
  }

  /**
   * Handles the refresh stats button callback
   */
  private async handleRefreshCallback(query: TelegramBotApi.CallbackQuery): Promise<void> {
    if (!query.data || !query.message) {
      this.logger.error('Invalid refresh callback: missing data or message');
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: 'Invalid refresh request',
        show_alert: true
      });
      return;
    }

    // Extract tweet ID from callback data (format: "refresh:TWEET_ID")
    const tweetId = query.data.split(':')[1];
    if (!tweetId) {
      this.logger.error(`Invalid refresh callback data format: ${query.data}`);
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: 'Invalid tweet ID',
        show_alert: true
      });
      return;
    }

    try {
      // Show loading state to user
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: 'Refreshing tweet stats...',
        show_alert: false
      });

      this.logger.info(`Refreshing stats for tweet ${tweetId}`);

      // Fetch the latest tweet data
      const tweet = await this.twitterClient.getTweetById(tweetId);
      
      if (!tweet) {
        this.logger.error(`Failed to fetch tweet ${tweetId} for refresh`);
        await this.telegramBot.answerCallbackQuery(query.id, {
          text: 'Could not fetch the latest tweet data',
          show_alert: true
        });
        return;
      }

      // Create updated message with refreshed stats
      const config: TweetMessageConfig = {
        tweet,
        quotedTweet: tweet.quotedTweet,
        replyToTweet: tweet.replyToTweet,
        mediaHandling: 'inline'
      };

      const updatedText = this.tweetFormatter.formatMessage(config);
      const updatedButtons = this.tweetFormatter.createMessageButtons(tweet, config);

      // Update the message with refreshed stats
      await this.telegramBot.editMessageText(updatedText, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: updatedButtons
        }
      });

      this.logger.info(`Successfully refreshed stats for tweet ${tweetId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error refreshing tweet stats: ${errorMessage}`, error as Error);
      
      await this.telegramBot.answerCallbackQuery(query.id, {
        text: 'Failed to refresh stats. Please try again.',
        show_alert: true
      });
    }
  }

  getCircuitBreakerStatus(): { failures: number; isOpen: boolean } {
    return this.circuitBreaker.getStatus();
  }

  async stop(): Promise<void> {
    try {
      this.telegramBot.stopPolling();
      this.isInitialized = false;
      fs.unlinkSync(this.lockFile);
    } catch (error) {
      this.logger.error('Error during shutdown:', error as Error);
    }
  }
}
