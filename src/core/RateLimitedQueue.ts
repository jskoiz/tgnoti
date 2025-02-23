import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../types/metrics.js';

type QueueTask<T> = () => Promise<T>;

interface QueueError extends Error {
  code?: string | number;
  details?: Record<string, unknown>;
}

@injectable()
export class RateLimitedQueue {
  private queue: QueueTask<any>[] = [];
  private processing: boolean = false;
  private requestsPerSecond: number = 1;
  private lastProcessTime: number;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.queue = [];
    this.processing = false;
    this.requestsPerSecond = 1; // Default rate limit
    this.lastProcessTime = Date.now();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing rate-limited queue');
    this.startProcessing(); // Launch processing in the background
    return Promise.resolve();
  }

  /**
   * Add a task to the queue for rate-limited execution
   */
  async add<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedTask = async () => {
        try {
          const result = await task();
          resolve(result);
          return result;
        } catch (error) {
          const queueError: QueueError = error instanceof Error ? error : new Error(String(error));
          reject(queueError);
          throw queueError;
        }
      };
      this.queue.push(wrappedTask);
    });
  }

  setRateLimit(requestsPerSecond: number): void {
    this.requestsPerSecond = requestsPerSecond;
    this.logger.info(`Rate limit set to ${requestsPerSecond} requests per second`);
  }

  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;
    
    (async () => {
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
            await new Promise(resolve => 
              setTimeout(resolve, minInterval - timeSinceLastProcess)
            );
          }

          await task();
          this.lastProcessTime = Date.now();
          this.metrics.increment('queue.tasks.processed');
        } catch (error) {
          const queueError: QueueError = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Error processing queue task:', { error: queueError });
          this.metrics.increment('queue.tasks.errors');
        }
      }
    })();
  }

  stop(): void {
    this.processing = false;
    this.logger.info('Stopping rate-limited queue');
  }
}
