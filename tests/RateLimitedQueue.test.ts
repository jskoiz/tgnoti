import { RateLimitedQueue } from '../src/core/RateLimitedQueue';
import { Logger } from '../src/types/logger';
import { MetricsManager } from '../src/utils/MetricsManager';
import { TYPES } from '../src/types/di';

// Create a mock class that extends MetricsManager
class MockMetricsManager extends MetricsManager {
  increment = jest.fn();
  decrement = jest.fn();
  gauge = jest.fn();
  timing = jest.fn();
  getValue = jest.fn();
  getMetrics = jest.fn();
  reset = jest.fn();
  resetAll = jest.fn();
}

describe('RateLimitedQueue', () => {
  let queue: RateLimitedQueue;
  let mockLogger: jest.Mocked<Logger>;
  let mockMetrics: MockMetricsManager;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Create a new instance of our mock class
    mockMetrics = new MockMetricsManager(mockLogger);

    queue = new RateLimitedQueue(mockLogger, mockMetrics);
  });

  afterEach(async () => {
    await queue.stop();
  });

  describe('initialization', () => {
    it('should initialize with default values', async () => {
      await queue.initialize();
      expect(queue.isProcessing()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing rate-limited queue');
      expect(mockMetrics.gauge).toHaveBeenCalledWith('queue.rate_limit', 1);
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limits', async () => {
      await queue.initialize();
      queue.setRateLimit(2); // 2 requests per second

      const start = Date.now();
      const task = jest.fn().mockResolvedValue(undefined);

      // Add 3 tasks
      await queue.add(task);
      await queue.add(task);
      await queue.add(task);

      // Wait for tasks to complete
      while (queue.getQueueSize() > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(1000); // Should take at least 1 second
      expect(task).toHaveBeenCalledTimes(3);
    });
  });

  describe('token bucket', () => {
    it('should properly manage token bucket', async () => {
      await queue.initialize();
      const status = queue.getTokenBucketStatus();
      expect(status.tokens).toBeLessThanOrEqual(status.capacity);
      expect(status.refillRate).toBe(60); // Default 60 tokens per minute
    });

    it('should allow configuration of token bucket', async () => {
      await queue.initialize();
      queue.setTokenBucketConfig(100, 120); // 100 capacity, 120 per minute
      const status = queue.getTokenBucketStatus();
      expect(status.capacity).toBe(100);
      expect(status.refillRate).toBe(120);
    });
  });

  describe('priority queue', () => {
    it('should process high priority tasks first', async () => {
      await queue.initialize();
      const processed: number[] = [];

      const createTask = (priority: number) => async () => {
        processed.push(priority);
      };

      await queue.add(createTask(1), 1);
      await queue.add(createTask(3), 3);
      await queue.add(createTask(2), 2);

      // Wait for tasks to complete
      while (queue.getQueueSize() > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(processed).toEqual([3, 2, 1]);
    });
  });

  describe('retry mechanism', () => {
    it('should retry failed tasks with exponential backoff', async () => {
      await queue.initialize();
      let attempts = 0;
      const task = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts <= 2) {
          throw new Error('Task failed');
        }
      });

      await queue.add(task);

      // Wait for retries to complete
      while (queue.getQueueSize() > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      expect(attempts).toBe(3);
      expect(mockMetrics.increment).toHaveBeenCalledWith('queue.tasks.retries');
    });

    it('should fail after max retries', async () => {
      await queue.initialize();
      const task = jest.fn().mockRejectedValue(new Error('Task failed'));

      await queue.add(task);

      // Wait for retries to complete
      while (queue.getQueueSize() > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      expect(task).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(mockMetrics.increment).toHaveBeenCalledWith('queue.tasks.failed');
    });
  });

  describe('metrics', () => {
    it('should track queue metrics', async () => {
      await queue.initialize();
      const task = jest.fn().mockResolvedValue(undefined);

      await queue.add(task);

      // Wait for task to complete
      while (queue.getQueueSize() > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      expect(mockMetrics.increment).toHaveBeenCalledWith('queue.tasks.added');
      expect(mockMetrics.increment).toHaveBeenCalledWith('queue.tasks.processed');
      expect(mockMetrics.gauge).toHaveBeenCalledWith('queue.size', expect.any(Number));
      expect(mockMetrics.timing).toHaveBeenCalledWith('queue.task.processing_time', expect.any(Number));
    });
  });

  describe('error handling', () => {
    it('should handle and log errors properly', async () => {
      await queue.initialize();
      const error = new Error('Test error');
      const task = jest.fn().mockRejectedValue(error);

      await queue.add(task);

      // Wait for task to fail
      while (queue.getQueueSize() > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      expect(mockLogger.error).toHaveBeenCalledWith('Error processing queue task:', error);
      expect(mockMetrics.increment).toHaveBeenCalledWith('queue.tasks.errors');
    });
  });
});