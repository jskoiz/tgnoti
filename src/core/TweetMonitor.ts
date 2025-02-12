import { injectable } from 'inversify';
import { Logger } from '../types/logger.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { Tweet } from '../types/twitter.js';

@injectable()
export class TweetMonitor {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(
    private logger: Logger,
    private twitterClient: TwitterClient,
    private metrics: MetricsManager,
    private errorHandler: ErrorHandler
  ) {}

  async initialize(): Promise<void> {
    this.logger.info('Initializing tweet monitor');
  }

  async start(intervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Tweet monitor is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting tweet monitor with ${intervalMs}ms interval`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkTweets();
      } catch (error) {
        this.errorHandler.handleError(
          error instanceof Error ? error : new Error('Unknown error'),
          'TweetMonitor'
        );
      }
    }, intervalMs);
  }

  private async checkTweets(): Promise<void> {
    try {
      this.metrics.increment('monitor.checks');
      this.logger.debug('Checking for new tweets');

      // Implementation will depend on specific monitoring requirements
      // This is just a placeholder for the structure
      const tweets = await this.getTweets();
      
      if (tweets.length > 0) {
        this.metrics.increment('monitor.tweets.found', tweets.length);
        this.logger.debug(`Found ${tweets.length} new tweets`);
      }

    } catch (error) {
      this.metrics.increment('monitor.errors');
      throw error; // Let the caller handle the error
    }
  }

  private async getTweets(): Promise<Tweet[]> {
    // Implementation will depend on specific search requirements
    // This is just a placeholder
    return [];
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Tweet monitor is not running');
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isRunning = false;
    this.logger.info('Tweet monitor stopped');
  }

  isActive(): boolean {
    return this.isRunning;
  }
}