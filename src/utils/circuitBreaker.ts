import { injectable } from 'inversify';

@injectable()
export class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private lastTest: number = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly testInterval: number;

  constructor(threshold = 5, resetTimeout = 30000, testInterval = 5000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
    this.testInterval = testInterval;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      // If in half-open state, only allow one test request
      if (this.isHalfOpen()) {
        if (Date.now() - this.lastTest < this.testInterval) {
          throw new Error('Circuit breaker is open');
        }
        this.lastTest = Date.now();
      }

      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    if (this.failures >= this.threshold) {
      const now = Date.now();
      if (now - this.lastFailure >= this.resetTimeout) {
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
    this.failures = 0;
    this.lastFailure = 0;
  }

  private recordFailure(): void {
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