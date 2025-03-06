import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { MetricsManager } from './MetricsManager.js';
import { StorageService } from '../../services/StorageService.js';
import { MetricsSnapshot } from '../../types/monitoring-enhanced.js';

@injectable()
export class EnhancedMetricsManager extends MetricsManager {
  private topicMetrics: Map<string, Map<string, number>> = new Map();
  private accountMetrics: Map<string, Map<string, number>> = new Map();
  private historicalMetrics: Array<MetricsSnapshot> = [];
  private lastPersistTime: number = 0;
  private persistInterval: number = 5 * 60 * 1000; // 5 minutes
  private persistTimer: NodeJS.Timeout | null = null;
  
  constructor(
    @inject(TYPES.Logger) logger: Logger,
    @inject(TYPES.StorageService) private storage: StorageService
  ) {
    super(logger);
    this.logger.setComponent('EnhancedMetricsManager');
    this.loadHistoricalMetrics();
    this.startPersistTimer();
  }
  
  /**
   * Load historical metrics from storage
   */
  private async loadHistoricalMetrics(): Promise<void> {
    try {
      try {
        const metrics = await this.storage.getHistoricalMetrics(100);
        if (metrics && metrics.length > 0) {
          this.historicalMetrics = metrics;
          this.logger.info(`Loaded ${metrics.length} historical metrics snapshots`);
        } else {
          this.logger.info('No historical metrics found, starting fresh');
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn('Failed to load historical metrics, starting fresh', err);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Unexpected error loading historical metrics', err);
    }
  }
  
  /**
   * Start timer to periodically persist metrics
   */
  private startPersistTimer(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }
    
    this.persistTimer = setInterval(() => {
      this.persistMetrics().catch(error => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Failed to persist metrics in timer', err);
      });
    }, this.persistInterval);
  }
  
  /**
   * Increment a metric for a specific topic
   * @param topicId Topic ID
   * @param metric Metric name
   * @param value Value to increment by (default: 1)
   */
  incrementForTopic(topicId: string, metric: string, value: number = 1): void {
    let topicMap = this.topicMetrics.get(topicId);
    if (!topicMap) {
      topicMap = new Map();
      this.topicMetrics.set(topicId, topicMap);
    }
    
    const currentValue = topicMap.get(metric) || 0;
    topicMap.set(metric, currentValue + value);
    
    // Also increment global metric
    this.increment(metric, value);
  }
  
  /**
   * Increment a metric for a specific account
   * @param account Account name/ID
   * @param metric Metric name
   * @param value Value to increment by (default: 1)
   */
  incrementForAccount(account: string, metric: string, value: number = 1): void {
    let accountMap = this.accountMetrics.get(account);
    if (!accountMap) {
      accountMap = new Map();
      this.accountMetrics.set(account, accountMap);
    }
    
    const currentValue = accountMap.get(metric) || 0;
    accountMap.set(metric, currentValue + value);
    
    // Also increment global metric
    this.increment(metric, value);
  }
  
  /**
   * Set a gauge metric for a specific topic
   * @param topicId Topic ID
   * @param metric Metric name
   * @param value Value to set
   */
  gaugeForTopic(topicId: string, metric: string, value: number): void {
    let topicMap = this.topicMetrics.get(topicId);
    if (!topicMap) {
      topicMap = new Map();
      this.topicMetrics.set(topicId, topicMap);
    }
    
    topicMap.set(metric, value);
    
    // Also set global metric
    this.gauge(metric, value);
  }
  
  /**
   * Set a gauge metric for a specific account
   * @param account Account name/ID
   * @param metric Metric name
   * @param value Value to set
   */
  gaugeForAccount(account: string, metric: string, value: number): void {
    let accountMap = this.accountMetrics.get(account);
    if (!accountMap) {
      accountMap = new Map();
      this.accountMetrics.set(account, accountMap);
    }
    
    accountMap.set(metric, value);
    
    // Also set global metric
    this.gauge(metric, value);
  }
  
  /**
   * Set a timing metric for a specific topic
   * @param topicId Topic ID
   * @param metric Metric name
   * @param value Timing value in ms
   */
  timingForTopic(topicId: string, metric: string, value: number): void {
    let topicMap = this.topicMetrics.get(topicId);
    if (!topicMap) {
      topicMap = new Map();
      this.topicMetrics.set(topicId, topicMap);
    }
    
    topicMap.set(metric, value);
    
    // Also set global metric
    this.timing(metric, value);
  }
  
  /**
   * Set a timing metric for a specific account
   * @param account Account name/ID
   * @param metric Metric name
   * @param value Timing value in ms
   */
  timingForAccount(account: string, metric: string, value: number): void {
    let accountMap = this.accountMetrics.get(account);
    if (!accountMap) {
      accountMap = new Map();
      this.accountMetrics.set(account, accountMap);
    }
    
    accountMap.set(metric, value);
    
    // Also set global metric
    this.timing(metric, value);
  }
  
  /**
   * Persist metrics to storage
   */
  async persistMetrics(): Promise<void> {
    try {
      try {
        const now = Date.now();
        
        // Don't persist too frequently
        if (now - this.lastPersistTime < 60000) { // At least 1 minute between persists
          return;
        }
        
        this.lastPersistTime = now;
        
        const snapshot: MetricsSnapshot = {
          timestamp: now,
          metrics: Object.fromEntries(this.metrics),
          topicMetrics: Object.fromEntries(
            Array.from(this.topicMetrics.entries()).map(
              ([topic, metrics]) => [topic, Object.fromEntries(metrics)]
            )
          ),
          accountMetrics: Object.fromEntries(
            Array.from(this.accountMetrics.entries()).map(
              ([account, metrics]) => [account, Object.fromEntries(metrics)]
            )
          )
        };
        
        await this.storage.saveMetricsSnapshot(snapshot);
        this.historicalMetrics.push(snapshot);
        
        // Trim historical metrics to keep only the last 100 snapshots
        if (this.historicalMetrics.length > 100) {
          this.historicalMetrics = this.historicalMetrics.slice(-100);
        }
        
        this.logger.debug('Persisted metrics snapshot');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.warn('Failed to persist metrics to storage, continuing without persistence', err);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to persist metrics', err);
    }
  }
  
  /**
   * Get metrics for a specific topic
   * @param topicId Topic ID
   */
  getTopicMetrics(topicId: string): Map<string, number> {
    return new Map(this.topicMetrics.get(topicId) || new Map());
  }
  
  /**
   * Get metrics for a specific account
   * @param account Account name/ID
   */
  getAccountMetrics(account: string): Map<string, number> {
    return new Map(this.accountMetrics.get(account) || new Map());
  }
  
  /**
   * Get historical metrics
   */
  getHistoricalMetrics(): Array<MetricsSnapshot> {
    return [...this.historicalMetrics];
  }
  
  /**
   * Get all topic metrics
   */
  getAllTopicMetrics(): Map<string, Map<string, number>> {
    return new Map(this.topicMetrics);
  }
  
  /**
   * Get all account metrics
   */
  getAllAccountMetrics(): Map<string, Map<string, number>> {
    return new Map(this.accountMetrics);
  }
  
  /**
   * Stop metrics manager and clean up
   */
  async stop(): Promise<void> {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    
    // Persist metrics one last time
    try {
      await this.persistMetrics();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('Failed to persist metrics during shutdown', err);
      // Continue with shutdown even if metrics persistence fails
    }
  }
}