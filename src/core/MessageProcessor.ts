import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { RateLimitedQueue } from './RateLimitedQueue.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { MetricsManager } from './monitoring/MetricsManager.js';
import { TYPES } from '../types/di.js';
import { TweetProcessor } from '../services/TweetProcessor.js';
import { Tweet } from '../types/twitter.js';
import { TopicConfig } from '../config/unified.js';

export interface TweetContext {
  tweet: Tweet;
  topic: TopicConfig;
}

@injectable()
export class MessageProcessor {
  constructor(
    @inject(TYPES.Logger)
    private logger: Logger,
    @inject(TYPES.TweetProcessor)
    private tweetProcessor: TweetProcessor,
    @inject(TYPES.RateLimitedQueue)
    private queue: RateLimitedQueue,
    @inject(TYPES.ErrorHandler)
    private errorHandler: ErrorHandler,
    @inject(TYPES.MetricsManager)
    private metrics: MetricsManager
  ) {}

  async processMessage(message: TweetContext): Promise<void> {
    try {
      this.metrics.increment('messages.received');
      
      // Add to rate-limited queue
      await this.queue.add(async () => {
        try {
          // Process message
          this.logger.debug('Processing message');
          await this.tweetProcessor.processTweet(message.tweet, message.topic);
          this.metrics.increment('messages.processed');
        } catch (error) {
          this.errorHandler.handleError(error instanceof Error ? error : new Error('Unknown error'), 'MessageProcessor');
          this.metrics.increment('messages.errors');
        }
      });

    } catch (error) {
      this.errorHandler.handleError(error instanceof Error ? error : new Error('Unknown error'), 'MessageProcessor');
      this.metrics.increment('messages.errors');
    }
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing message processor');
    await this.queue.initialize();
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping message processor');
    await this.queue.stop();
  }
}