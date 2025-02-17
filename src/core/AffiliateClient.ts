import { inject, injectable } from 'inversify';
import { User } from 'rettiwt-api';
import { AffiliatedAccount } from '../types/twitter.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../types/metrics.js';
import {
  AffiliateConfig,
  IAffiliateClient,
  AFFILIATE_TYPES,
} from '../types/affiliate.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

@injectable()
export class AffiliateClient implements IAffiliateClient {
  private cache: Map<string, { affiliates: string[]; timestamp: number }> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(AFFILIATE_TYPES.AffiliateConfig) private config: AffiliateConfig
  ) {}

  async fetchAffiliates(orgUsername: string): Promise<string[]> {
    try {
      // Check cache first
      const cached = this.cache.get(orgUsername);
      const now = Date.now();
      if (cached && now - cached.timestamp < this.config.cacheTimeMinutes * 60 * 1000) {
        this.logger.debug(`Using cached affiliates for ${orgUsername}`);
        return cached.affiliates;
      }

      // Get affiliated accounts using the Twitter client
      const affiliatedAccounts = await this.twitterClient.getAffiliatedAccounts(orgUsername);
      
      if (!affiliatedAccounts || !Array.isArray(affiliatedAccounts)) {
        this.logger.debug(`No affiliates found for ${orgUsername}`);
        return [];
      }

      // Get usernames from affiliated accounts
      const affiliateUsernames = affiliatedAccounts.map(account => account.username);

      this.logger.debug(
        `Found ${affiliateUsernames.length} affiliated accounts for ${orgUsername}`
      );

      // Update cache
      this.cache.set(orgUsername, {
        affiliates: affiliateUsernames,
        timestamp: now,
      });

      this.metrics.increment('affiliate.fetch.success');
      return affiliateUsernames;
    } catch (error) {
      this.logger.error(`Failed to fetch affiliates for ${orgUsername}`, error as Error);
      this.metrics.increment('affiliate.fetch.error');
      throw error;
    }
  }

  async getUserDetails(userId: string): Promise<User | undefined> {
    try {
      // Get affiliated account details which includes all necessary user information
      const affiliatedAccounts = await this.twitterClient.getAffiliatedAccounts(userId);
      if (!affiliatedAccounts || affiliatedAccounts.length === 0) {
        return undefined;
      }

      const account = affiliatedAccounts[0];
      // Convert AffiliatedAccount to User type with all required properties
      return {
        id: account.id,
        userName: account.username,
        fullName: account.displayName,
        createdAt: new Date().toISOString(), // Default since not available in affiliated account
        followersCount: 0, // Default since not available in affiliated account
        followingsCount: 0, // Default since not available in affiliated account
        isVerified: account.verified_type !== 'none',
        profileImage: '', // Default since not available in affiliated account
        description: '', // Default since not available in affiliated account
        likeCount: 0, // Default since not available in affiliated account
        statusesCount: 0 // Default since not available in affiliated account
      };
    } catch (error) {
      this.logger.error(`Failed to get user details for ${userId}`, error as Error);
      return undefined;
    }
  }
}