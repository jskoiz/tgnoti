import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { TYPES } from '../types/di.js';

type QueueTask = () => Promise<void>;

@injectable()
export class RateLimitedQueue {
  private queue: QueueTask[];
  private processing: boolean;
  private requestsPerSecond: number;
  private lastProcessTime: number;

  constructor(
    @inject(TYPES.Logger)
    private logger: Logger,
    @inject(TYPES.MetricsManager)
    private metrics: MetricsManager
  ) {
    this.queue = [];
    this.processing = false;
    this.requestsPerSecond = 1; // Default to 1 request per second
    this.lastProcessTime = Date.now();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing rate-limited queue');
    this.startProcessing();
  }

  setRateLimit(requestsPerSecond: number): void {
    this.requestsPerSecond = requestsPerSecond;
    this.logger.debug(`Rate limit set to ${requestsPerSecond} requests per second`);
  }

  async add(task: QueueTask): Promise<void> {
    this.queue.push(task);
    this.metrics.increment('queue.tasks.added');
    this.logger.debug(`Task added to queue. Queue size: ${this.queue.length}`);
  }

  private async startProcessing(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    this.logger.debug('Started processing queue');

    while (this.processing) {
      try {
        const task = this.queue.shift();
        if (!task) {
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }

        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        const minInterval = 1000 / this.requestsPerSecond;

        if (timeSinceLastProcess < minInterval) {
          await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastProcess));
        }

        await task();
        this.lastProcessTime = Date.now();
        this.metrics.increment('queue.tasks.processed');

      } catch (error) {
        this.logger.error('Error processing queue task:', error instanceof Error ? error : new Error('Unknown error'));
        this.metrics.increment('queue.tasks.errors');
      }
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping rate-limited queue');
    this.processing = false;
    this.queue = [];
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }
}