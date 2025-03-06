import { injectable, inject } from 'inversify';
import { Storage } from './storage/storage.js';
import { TelegramBot } from '../telegram/bot/telegramBot.js';
import type { AppConfig } from '../config/index.js';
import { Logger } from '../types/logger.js';
import { Environment } from '../config/environment.js';
import { TYPES } from '../types/di.js';
import { DateValidator, DateValidationError } from '../utils/dateValidation.js';
import { TweetProcessor } from '../services/TweetProcessor.js';
import { SearchStrategy } from './twitter/searchStrategy.js';
import { MetricsManager } from './monitoring/MetricsManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { SearchQueryConfig, Tweet } from '../types/twitter.js';
import { SearchConfig } from '../config/searchConfig.js';
import { ConfigService } from '../services/ConfigService.js';

@injectable()
export class TwitterNotifier {
  private isRunning = false;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TelegramBot) private telegram: TelegramBot,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.DateValidator) private dateValidator: DateValidator,
    @inject(TYPES.TweetProcessor) private tweetProcessor: TweetProcessor,
    @inject(TYPES.SearchStrategy) private searchStrategy: SearchStrategy,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig,
    @inject(TYPES.ConfigService) private configService: ConfigService
  ) {}

  async initialize(): Promise<void> {
    try {
      const startTime = Date.now();
      this.logger.info('Starting TwitterNotifier initialization');

      // System checks
      await this.dateValidator.validateSystemTime();
      this.environment.validateEnvironment();
      await this.storage.getConfig();
      await this.storage.verify();
      
      // Initialize Telegram bot
      try {
        this.logger.info('Initializing Telegram bot');
        await this.telegram.initialize();
        this.logger.info('Telegram bot initialized successfully');
      } catch (telegramError) {
        this.logger.error('Failed to initialize Telegram bot', telegramError instanceof Error ? telegramError : new Error(String(telegramError)));
        throw telegramError;
      }

      const initTime = Date.now() - startTime;
      this.metrics.timing('notifier.init_time', initTime);
      this.logger.logObject('info', 'TwitterNotifier initialization complete', { duration: `${initTime}ms` });

    } catch (error) {
      if (error instanceof DateValidationError) {
        this.errorHandler.handleError(error, 'Time validation');
        throw new Error(
          'System time is invalid. Please ensure your system clock is set to the current time ' +
          'and is within the valid range (2024).'
        );
      }
      this.errorHandler.handleError(error, 'Initialization');
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Initialize all components
      await this.initialize();

      // Get environment config which includes monitoring settings
      const envConfig = this.environment.getConfig();
      
      this.logger.debug('Starting notifier', {
        system: 'simplified',
        pollingInterval: envConfig.monitoring.polling.intervalMinutes
      });
      
      this.isRunning = true;
      this.metrics.gauge('notifier.running', 1);

      this.logger.debug('Notifier started');

      // Main processing loop
      while (this.isRunning) {
        const startTime = Date.now();

        try {
          // Get config for search queries
          const config = await this.storage.getConfig();
          const searchQueries = config.twitter.searchQueries as Record<string, SearchQueryConfig>;
          let processed = 0, sent = 0, errors = 0;

          // Get all topics from ConfigService
          const topics = this.configService.getTopics();
          
          // Process each topic and its accounts
          for (const topic of topics) {
            const topicId = topic.id.toString();
            
            // Skip topics with no accounts
            if (!topic.accounts || topic.accounts.length === 0) {
              this.logger.debug(`Skipping topic ${topic.name} with no accounts`);
              continue;
            }
            
            // Process each account in the topic
            for (const account of topic.accounts) {
              // Get search window from config
              const window = await this.searchConfig.createSearchWindow();

              // Validate search window to prevent duplicate processing
              const searchWindowKey = `${topicId}:${account}`;
              if (await this.searchConfig.validateSearchWindow(searchWindowKey, window)) {
                this.logger.logObject('debug', 'Processing search window', {
                  account,
                  topic: topic.name,
                  window: `${new Date(window.startDate).toLocaleTimeString()} - ${new Date(window.endDate).toLocaleTimeString()}`
                });

                // Get new tweets using SearchStrategy
                const tweets = await this.searchStrategy.search({
                  username: account,
                  startDate: window.startDate,
                  endDate: window.endDate,
                  excludeRetweets: true,
                  excludeQuotes: true,
                  language: 'en'
                });

                if (tweets.length > 0) {
                  const batchStartTime = Date.now();

                  // Process tweets individually with the TweetProcessor
                  for (const tweet of tweets) {
                    try {
                      const success = await this.tweetProcessor.processTweet(tweet, topic);
                      if (success) {
                        sent++;
                      }
                      processed++;
                    } catch (tweetError) {
                      errors++;
                      this.logger.error(`Error processing tweet ${tweet.id}:`, 
                        tweetError instanceof Error ? tweetError : new Error(String(tweetError)));
                    }
                  }
                
                  this.metrics.timing('notifier.processing.batch_time', Date.now() - batchStartTime);
                  this.metrics.increment('notifier.processing.tweets_processed', tweets.length);
                }
              } else {
                this.logger.debug('Skipping already processed window', { topicId, account });
              }
            }
          }
          
          // Log processing summary
          this.logger.logObject('debug', 'Processing cycle complete', {
            stats: `${processed} processed, ${sent} sent, ${errors} errors`,
            system: 'simplified'
          });
          
          // Perform storage cleanup
          try {
            const cleanupStart = Date.now();
            await this.storage.cleanup();
            this.metrics.timing('storage.cleanup_duration', Date.now() - cleanupStart);
          } catch (cleanupError) {
            this.errorHandler.handleError(cleanupError, 'Storage cleanup');
          }

          // Record cycle metrics
          this.metrics.timing('notifier.cycle_time', Date.now() - startTime);
          this.metrics.gauge('notifier.last_cycle_tweets', processed);
          this.metrics.gauge('notifier.last_cycle_errors', errors);
        } catch (error) {
          this.errorHandler.handleError(error, 'Processing cycle');
          this.metrics.increment('notifier.cycle_failures');
        }

        // Convert polling interval from minutes to milliseconds
        const pollingIntervalMs = envConfig.monitoring.polling.intervalMinutes * 60 * 1000;
        
        // Wait for next cycle using monitoring polling interval
        await new Promise(resolve => 
          setTimeout(resolve, pollingIntervalMs)
        );
      }
    } catch (error) {
      this.errorHandler.handleError(error, 'Notifier start');
      this.metrics.gauge('notifier.running', 0);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.metrics.gauge('notifier.running', 0);

    if (this.telegram) {
      try {
        await this.telegram.stop();
      } catch (error) {
        this.errorHandler.handleError(error, 'Shutdown');
      }
    }

    this.logger.debug('Notifier stopped');
  }
}
