import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { CircuitBreakerConfig } from '../types/monitoring.js';
import { TYPES } from '../types/di.js';

@injectable()
export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private lastTest: number = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly testInterval: number;

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    @inject(TYPES.CircuitBreakerConfig) config: CircuitBreakerConfig
  ) {
    this.threshold = config.threshold;
    this.resetTimeout = config.resetTimeout;
    this.testInterval = config.testInterval;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      this.logger.warn('Circuit breaker is open, blocking request');
      throw new Error('Circuit breaker is open');
    }

    try {
      // If in half-open state, only allow one test request
      if (this.isHalfOpen()) {
        if (Date.now() - this.lastTest < this.testInterval) {
          this.logger.warn('Circuit breaker in half-open state, waiting for test interval');
          throw new Error('Circuit breaker is open');
        }
        this.lastTest = Date.now();
      }

      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      // Check if it's a rate limit error
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        this.logger.warn('Rate limit error detected, not counting toward circuit breaker failures');
        // Don't count rate limit errors toward circuit breaker failures
        throw error;
      }

      this.logger.error('Non-rate-limit error detected, recording circuit breaker failure');
      this.recordFailure(error);
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.failures >= this.threshold) {
      const now = Date.now();
      if (now - this.lastFailure >= this.resetTimeout) {
        this.logger.info('Circuit breaker reset timeout reached, resetting failures');
        this.reset();
        return false;
      }
      return true;
    }
    return false;
  }

  private isHalfOpen(): boolean {
    if (this.failures >= this.threshold) {
      return Date.now() - this.lastFailure >= this.resetTimeout;
    }
    return false;
  }

  private reset(): void {
    if (this.failures > 0) {
      this.logger.info(`Resetting circuit breaker from ${this.failures} failures`);
    }
    this.failures = 0;
    this.lastFailure = 0;
  }

  private recordFailure(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Recording circuit breaker failure #${this.failures + 1}: ${errorMessage}`);
    this.failures++;
    this.lastFailure = Date.now();
  }

  getStatus(): { failures: number; isOpen: boolean; halfOpen: boolean } {
    return {
      failures: this.failures,
      isOpen: this.isOpen(),
      halfOpen: this.isHalfOpen()
    };
  }
}