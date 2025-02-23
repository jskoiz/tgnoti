import { injectable, inject } from 'inversify';
import { Storage } from '../storage/storage.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { AppConfig } from '../config/index.js';
import { Logger } from '../types/logger.js';
import { Environment } from '../config/environment.js';
import { TYPES } from '../types/di.js';
import { DateValidator, DateValidationError } from '../utils/dateValidation.js';
import { TweetProcessor } from './TweetProcessor.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';

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
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler
  ) {}

  async initialize(): Promise<void> {
    try {
      const startTime = Date.now();
      this.logger.info('Initializing Twitter Notifier...');

      // 1. Validate system time
      this.logger.info('Validating system time...');
      this.dateValidator.validateSystemTime();

      // 2. Validate environment
      this.logger.info('Validating environment...');
      this.environment.validateEnvironment();

      // 3. Load configuration
      this.logger.info('Loading configuration...');
      await this.storage.getConfig();

      // 4. Verify storage and other components
      this.logger.info('Verifying storage...');
      await this.storage.verify();

      const initTime = Date.now() - startTime;
      this.metrics.timing('notifier.init_time', initTime);
      this.logger.info(`Initialization complete (${initTime}ms)`);
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
      const config = this.environment.getConfig();
      this.isRunning = true;
      this.metrics.gauge('notifier.running', 1);

      this.logger.info('Twitter Notifier started successfully');

      // Main processing loop
      while (this.isRunning) {
        const startTime = Date.now();

        try {
          const result = await this.tweetProcessor.processNewTweets();
          
          // Log processing summary
          this.logger.info(
            `Processing cycle complete: ${result.totalProcessed} tweets processed, ` +
            `${result.totalSent} sent, ${result.totalErrors} errors ` +
            `(${result.processingTimeMs}ms)`
          );

          // Record cycle metrics
          this.metrics.timing('notifier.cycle_time', Date.now() - startTime);
          this.metrics.gauge('notifier.last_cycle_tweets', result.totalProcessed);
          this.metrics.gauge('notifier.last_cycle_errors', result.totalErrors);
        } catch (error) {
          this.errorHandler.handleError(error, 'Processing cycle');
          this.metrics.increment('notifier.cycle_failures');
        }

        // Convert polling interval from minutes to milliseconds
        const pollingIntervalMs = config.monitoring.polling.intervalMinutes * 60 * 1000;
        
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

    this.logger.info('Twitter Notifier stopped');
  }
}
