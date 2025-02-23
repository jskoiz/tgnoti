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
  private lastHeartbeat: number;
  private readonly TASK_TIMEOUT = 30000; // 30 second task timeout

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.queue = [];
    this.processing = false;
    this.requestsPerSecond = 1; // Default rate limit
    this.lastProcessTime = Date.now();
    this.lastHeartbeat = Date.now();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing rate-limited queue');
    this.startProcessing(); // Launch processing in the background
    this.startHeartbeat(); // Start heartbeat monitoring
    return Promise.resolve();
  }

  /**
   * Add a task to the queue for rate-limited execution
   */
  async add<T>(task: QueueTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrappedTask = async () => {
        // Check if queue is healthy
        if (Date.now() - this.lastHeartbeat > 5000) { // 5 seconds
          this.logger.error('Queue heartbeat missing, restarting processor');
          this.startProcessing();
        }

        try {
          const result = await task();
          resolve(result);
          return result;
        } catch (error) {
          const queueError: QueueError = error instanceof Error ? error : new Error(String(error));
          reject(queueError);
          return; // Don't throw after reject to avoid unhandled rejection
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

          const taskPromise = task();
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Task timeout exceeded')), this.TASK_TIMEOUT);
          });

          try {
            await Promise.race([taskPromise, timeoutPromise]);
          } catch (error) {
            if (error instanceof Error && error.message === 'Task timeout exceeded') {
              this.logger.error('Queue task timed out');
              this.metrics.increment('queue.tasks.timeout');
              continue;
            }
            throw error;
          }

          this.lastProcessTime = Date.now();
          this.lastHeartbeat = Date.now();
          this.metrics.increment('queue.tasks.processed');
        } catch (error) {
          const queueError: QueueError = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Error processing queue task:', { error: queueError });
          this.metrics.increment('queue.tasks.errors');
        }
      }
    })();
  }

  private startHeartbeat(): void {
    setInterval(() => {
      const now = Date.now();
      const timeSinceHeartbeat = now - this.lastHeartbeat;
      
      this.logger.debug('Queue heartbeat', {
        queueSize: this.queue.length,
        timeSinceLastProcess: now - this.lastProcessTime,
        timeSinceHeartbeat,
        isProcessing: this.processing
      });

    }, 1000); // Check every second
  }

  stop(): void {
    this.processing = false;
    this.queue = [];
    this.logger.info('Stopping rate-limited queue');
  }
}
