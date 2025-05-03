import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { EnhancedCircuitBreakerConfig, CircuitBreakerState } from '../types/monitoring-enhanced.js';

@injectable()
export class EnhancedCircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private lastTest: number = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly testInterval: number;
  private readonly monitorInterval: number;
  private monitorTimer: NodeJS.Timeout | null = null;
  private onStateChange: ((state: CircuitBreakerState) => void) | null = null;

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger,
    config: EnhancedCircuitBreakerConfig
  ) {
    this.threshold = config.threshold;
    this.resetTimeout = config.resetTimeout;
    this.testInterval = config.testInterval;
    this.monitorInterval = config.monitorInterval;
    this.logger.setComponent('EnhancedCircuitBreaker');
    
    // Start monitoring state changes
    this.startMonitoring();
  }

  /**
   * Set a callback to be called when the circuit breaker state changes
   */
  setStateChangeCallback(callback: (state: CircuitBreakerState) => void): void {
    this.onStateChange = callback;
  }

  /**
   * Restore circuit breaker state from persisted state
   */
  restoreState(state: CircuitBreakerState): void {
    this.failures = state.failures;
    this.lastFailure = state.lastFailure;
    this.lastTest = state.lastTest;
    this.logger.info(`Circuit breaker state restored: ${this.failures} failures, last failure at ${new Date(this.lastFailure).toISOString()}`);
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState {
    return {
      failures: this.failures,
      lastFailure: this.lastFailure,
      lastTest: this.lastTest
    };
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, category: string = 'default'): Promise<T> {
    if (this.isOpen()) {
      this.logger.warn(`Circuit breaker for ${category} is open, blocking request`);
      throw new Error(`Circuit breaker for ${category} is open`);
    }

    try {
      // If in half-open state, only allow one test request
      if (this.isHalfOpen()) {
        if (Date.now() - this.lastTest < this.testInterval) {
          this.logger.warn(`Circuit breaker for ${category} in half-open state, waiting for test interval`);
          throw new Error(`Circuit breaker for ${category} is open`);
        }
        this.lastTest = Date.now();
        this.notifyStateChange();
      }

      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      // Check if it's a rate limit error
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429') || errorMessage.includes('too_many_requests')) {
        this.logger.warn(`Rate limit error detected for ${category}, not counting toward circuit breaker failures`);
        // Don't count rate limit errors toward circuit breaker failures
        throw error;
      }

      this.logger.error(`Non-rate-limit error detected for ${category}, recording circuit breaker failure`);
      this.recordFailure(error);
      throw error;
    }
  }

  /**
   * Check if the circuit is open (blocking requests)
   */
  isOpen(): boolean {
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

  /**
   * Check if the circuit is half-open (allowing test requests)
   */
  isHalfOpen(): boolean {
    if (this.failures >= this.threshold) {
      return Date.now() - this.lastFailure >= this.resetTimeout;
    }
    return false;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    const hadFailures = this.failures > 0;
    if (hadFailures) {
      this.logger.info(`Resetting circuit breaker from ${this.failures} failures`);
    }
    this.failures = 0;
    this.lastFailure = 0;
    
    if (hadFailures) {
      this.notifyStateChange();
    }
  }
  
  /**
   * Force reset all circuit breakers - use this to recover from persistent failures
   * This is a more aggressive reset that clears all state
   */
  forceReset(): void {
    this.logger.warn(`Force resetting circuit breaker from ${this.failures} failures`);
    this.failures = 0;
    this.lastFailure = 0;
    this.lastTest = 0;
    this.notifyStateChange();
  }

  /**
   * Record a failure
   */
  private recordFailure(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(`Recording circuit breaker failure #${this.failures + 1}: ${errorMessage}`);
    this.failures++;
    this.lastFailure = Date.now();
    this.notifyStateChange();
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): { failures: number; isOpen: boolean; halfOpen: boolean } {
    return {
      failures: this.failures,
      isOpen: this.isOpen(),
      halfOpen: this.isHalfOpen()
    };
  }

  /**
   * Start monitoring state changes
   */
  private startMonitoring(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
    
    this.monitorTimer = setInterval(() => {
      // Check if circuit state has changed from open to half-open
      if (this.failures >= this.threshold) {
        const wasOpen = this.isOpen();
        const isHalfOpen = this.isHalfOpen();
        
        if (!wasOpen && isHalfOpen) {
          this.logger.info('Circuit breaker transitioned from open to half-open state');
          this.notifyStateChange();
        }
      }
    }, this.monitorInterval);
  }

  /**
   * Notify state change callback if set
   */
  private notifyStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * Stop monitoring and clean up
   */
  stop(): void {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
  }
}