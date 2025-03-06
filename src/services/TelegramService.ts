import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import TelegramBot from 'node-telegram-bot-api';

@injectable()
export class TelegramService {
  private bot: TelegramBot;
  private messageQueue: { message: string, topicId: number }[] = [];
  private isProcessing: boolean = false;
  private queueInterval: NodeJS.Timeout | null = null;
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('TelegramService');
    const telegramConfig = this.config.getTelegramConfig();
    
    this.bot = new TelegramBot(telegramConfig.api.botToken, { polling: false });
  }
  
  async initialize(): Promise<void> {
    const telegramConfig = this.config.getTelegramConfig();
    const queueCheckInterval = 1000; // Default to 1 second
    
    this.queueInterval = setInterval(() => this.processQueue(), queueCheckInterval);
    this.logger.info('TelegramService initialized');
  }
  
  async sendMessage(message: string, topicId: number): Promise<void> {
    this.messageQueue.push({ message, topicId });
    this.metrics.increment('telegram.messages.queued');
    this.logger.info(`Message queued for topic ${topicId}, queue length: ${this.messageQueue.length}`);
  }
  
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }
    
    this.logger.info(`Processing Telegram message queue, length: ${this.messageQueue.length}`);
    this.isProcessing = true;
    
    try {
      const { message, topicId } = this.messageQueue.shift()!;
      const telegramConfig = this.config.getTelegramConfig();
      
      this.logger.info(`Sending message to Telegram topic ${topicId}, group ID: ${telegramConfig.api.groupId}`);
      this.logger.info(`Telegram bot token: ${telegramConfig.api.botToken.substring(0, 10)}...`);
      
      const messageOptions = {
        parse_mode: telegramConfig.messageOptions.parse_mode as 'HTML' | 'Markdown' | 'MarkdownV2' | undefined,
        disable_web_page_preview: telegramConfig.messageOptions.disable_web_page_preview,
        disable_notification: false,
        protect_content: false,
        message_thread_id: topicId
      };
      
      try {
        await this.bot.sendMessage(telegramConfig.api.groupId, message, messageOptions);
        this.logger.info(`Message successfully sent to Telegram topic ${topicId}`);
      } catch (sendError) {
        this.logger.error(`Error in bot.sendMessage: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
        throw sendError;
      }
      
      this.metrics.increment('telegram.messages.sent');
      this.logger.info(`Message sent to topic ${topicId}, remaining queue: ${this.messageQueue.length}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.metrics.increment('telegram.messages.error');
      this.logger.error(`Error sending Telegram message: ${err.message}`, err);
      this.logger.error(`Error stack: ${err.stack}`);
    } finally {
      this.isProcessing = false;
      
      // Process next message if queue is not empty
      if (this.messageQueue.length > 0) {
        this.logger.info(`Scheduling next message processing in 1 second, queue length: ${this.messageQueue.length}`);
        setTimeout(() => this.processQueue(), 1000);
      }
    }
  }
  
  async stop(): Promise<void> {
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    
    this.logger.info('TelegramService stopped');
  }
}