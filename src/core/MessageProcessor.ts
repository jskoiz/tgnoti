import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TweetProcessingPipeline } from './pipeline/TweetProcessingPipeline.js';
import { RateLimitedQueue } from './RateLimitedQueue.js';
import { TweetContext } from './pipeline/types/PipelineTypes.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { MetricsManager } from './monitoring/MetricsManager.js';
import { TYPES } from '../types/di.js';

@injectable()
export class MessageProcessor {
  constructor(
    @inject(TYPES.Logger)
    private logger: Logger,
    @inject(TYPES.TweetProcessingPipeline)
    private pipeline: TweetProcessingPipeline,
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
      
      // Process through pipeline
      const result = await this.pipeline.process(message);
      
      if (!result.success) {
        this.metrics.increment('messages.failed');
        this.logger.debug('Message processing failed', {
          error: result.error
        });
        return;
      }

      // Add to rate-limited queue
      await this.queue.add(async () => {
        try {
          // Process message
          this.logger.debug('Processing message');
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