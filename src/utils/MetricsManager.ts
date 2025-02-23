import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';

@injectable()
export class MetricsManager {
  protected metrics: Map<string, number>;

  constructor(@inject(TYPES.Logger) public logger: Logger) {
    this.metrics = new Map();
  }

  increment(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue + value);
    this.logger.debug(`Metric ${metric} incremented by ${value} to ${currentValue + value}`);
  }

  decrement(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue - value);
    this.logger.debug(`Metric ${metric} decremented by ${value} to ${currentValue - value}`);
  }

  gauge(metric: string, value: number): void {
    this.metrics.set(metric, value);
    this.logger.debug(`Metric ${metric} gauge set to ${value}`);
  }

  timing(metric: string, value: number): void {
    this.metrics.set(metric, value);
    this.logger.debug(`Metric ${metric} timing set to ${value}ms`);
  }

  protected setValue(metric: string, value: number): void {
    this.metrics.set(metric, value);
    this.logger.debug(`Metric ${metric} set to ${value}`);
  }

  getValue(metric: string): number {
    return this.metrics.get(metric) || 0;
  }

  getMetrics(): Map<string, number> {
    return new Map(this.metrics);
  }

  reset(metric: string): void {
    this.metrics.delete(metric);
    this.logger.debug(`Metric ${metric} reset`);
  }

  resetAll(): void {
    this.metrics.clear();
    this.logger.debug('All metrics reset');
  }
}