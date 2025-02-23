export interface MetricsManager {
  increment(metric: string, value?: number): void;
  decrement(metric: string, value?: number): void;
  gauge(metric: string, value: number): void;
  timing(metric: string, value: number): void;
}