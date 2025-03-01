import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { FilterPipeline } from './FilterPipeline.js';
import { RateLimitedQueue } from './RateLimitedQueue.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { TYPES } from '../types/di.js';

@injectable()
export class MessageProcessor {
  constructor(
    @inject(TYPES.Logger)
    private logger: Logger,
    @inject(TYPES.FilterPipeline)
    private filterPipeline: FilterPipeline,
    @inject(TYPES.RateLimitedQueue)
    private queue: RateLimitedQueue,
    @inject(TYPES.ErrorHandler)
    private errorHandler: ErrorHandler,
    @inject(TYPES.MetricsManager)
    private metrics: MetricsManager
  ) {}

  async processMessage(message: any): Promise<void> {
    try {
      this.metrics.increment('messages.received');
      
      // Apply filters
      const shouldProcess = await this.filterPipeline.apply(message);
      if (!shouldProcess) {
        this.metrics.increment('messages.filtered');
        this.logger.debug('Message filtered out by pipeline');
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
    await this.filterPipeline.initialize();
    await this.queue.initialize();
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping message processor');
    await this.queue.stop();
  }
}