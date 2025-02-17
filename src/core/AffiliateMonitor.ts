import { inject, injectable } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../types/metrics.js';
import {
  AffiliateChange,
  AffiliateCheckResult,
  AffiliateConfig,
  IAffiliateMonitor,
  IAffiliateStorage,
  IAffiliateClient,
  AFFILIATE_TYPES,
} from '../types/affiliate.js';

@injectable()
export class AffiliateMonitor implements IAffiliateMonitor {
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private cache: Map<string, { affiliates: string[]; timestamp: number }> = new Map();

  constructor(
    @inject(AFFILIATE_TYPES.AffiliateStorage) private storage: IAffiliateStorage,
    @inject(AFFILIATE_TYPES.AffiliateClient) private affiliateClient: IAffiliateClient,
    @inject(AFFILIATE_TYPES.AffiliateConfig) private config: AffiliateConfig,
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {}

  async startMonitoring(orgUsername: string): Promise<void> {
    try {
      // Add to monitored orgs if not already monitoring
      await this.storage.addMonitoredOrg(orgUsername);

      // Clear any existing interval
      this.stopMonitoringInternal(orgUsername);

      // Perform initial check
      await this.checkAffiliates(orgUsername);

      // Set up periodic checking
      const interval = setInterval(
        () => this.checkAffiliates(orgUsername).catch(err => {
          this.logger.error(`Failed to check affiliates for ${orgUsername}`, err);
          this.metrics.increment('affiliate.check.errors');
        }),
        this.config.checkIntervalMinutes * 60 * 1000
      );

      this.checkIntervals.set(orgUsername, interval);
      this.logger.info(`Started monitoring affiliates for ${orgUsername}`);
      this.metrics.increment('affiliate.monitoring.active');
    } catch (error) {
      this.logger.error(`Failed to start monitoring ${orgUsername}`, error as Error);
      throw error;
    }
  }

  async stopMonitoring(orgUsername: string): Promise<void> {
    try {
      await this.storage.removeMonitoredOrg(orgUsername);
      this.stopMonitoringInternal(orgUsername);
      this.logger.info(`Stopped monitoring affiliates for ${orgUsername}`);
      this.metrics.decrement('affiliate.monitoring.active');
    } catch (error) {
      this.logger.error(`Failed to stop monitoring ${orgUsername}`, error as Error);
      throw error;
    }
  }

  private stopMonitoringInternal(orgUsername: string): void {
    const interval = this.checkIntervals.get(orgUsername);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(orgUsername);
    }
  }

  async checkAffiliates(orgUsername: string): Promise<AffiliateCheckResult> {
    try {
      // Check cache first
      const cached = this.cache.get(orgUsername);
      const now = Date.now();
      if (
        cached &&
        now - cached.timestamp < this.config.cacheTimeMinutes * 60 * 1000
      ) {
        return {
          cached: true,
        };
      }

      // Get current affiliates from storage
      const currentAffiliates = await this.storage.getAffiliates(orgUsername);

      // Fetch new affiliates using the affiliate client
      const newAffiliates = await this.affiliateClient.fetchAffiliates(orgUsername);

      // Calculate changes
      const added = newAffiliates.filter(a => !currentAffiliates.includes(a));
      const removed = currentAffiliates.filter(a => !newAffiliates.includes(a));

      if (added.length > 0 || removed.length > 0) {
        const change: AffiliateChange = {
          added,
          removed,
          timestamp: new Date(),
        };

        // Store new state and record change
        await Promise.all([
          this.storage.updateAffiliates(orgUsername, newAffiliates),
          this.storage.addAffiliateChange(orgUsername, change),
        ]);

        this.metrics.increment('affiliate.changes.detected');
        return {
          changes: change,
          cached: false,
        };
      }

      return {
        cached: false,
      };
    } catch (error) {
      this.logger.error(`Failed to check affiliates for ${orgUsername}`, error as Error);
      this.metrics.increment('affiliate.check.errors');
      return {
        error: error as Error,
        cached: false,
      };
    }
  }

  async getMonitoredOrgs(): Promise<string[]> {
    return this.storage.getMonitoredOrgs();
  }
}