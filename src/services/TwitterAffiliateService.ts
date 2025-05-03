import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { TwitterClient } from '../core/twitter/twitterClient.js';
import { Affiliate, AffiliateChange } from '../types/affiliates.js';
import { MongoDBService } from './MongoDBService.js';

@injectable()
export class TwitterAffiliateService {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private configService: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TwitterClient) private twitterClient: TwitterClient,
    @inject(TYPES.MongoDBService) private mongoDBService: MongoDBService
  ) {
    this.logger.setComponent('TwitterAffiliateService');
  }

  /**
   * Get affiliates for a Twitter user by ID
   * @param userId Twitter user ID
   * @param count Maximum number of affiliates to fetch
   * @returns Array of affiliates
   */
  async getUserAffiliates(userId: string, count: number = 50): Promise<Affiliate[]> {
    const startTime = Date.now();
    this.metrics.increment('twitter.affiliates.requests');

    try {
      this.logger.info(`Fetching affiliates for user ID ${userId}`);
      
      // Get user details to ensure we have the username
      const userDetails = await this.twitterClient.getUserDetails(userId);
      if (!userDetails) {
        throw new Error(`User with ID ${userId} not found`);
      }
      
      // Use the TwitterClient to fetch affiliates
      const affiliatesData = await this.twitterClient.getUserAffiliates(userId, count);
      
      this.metrics.timing('twitter.affiliates.duration', Date.now() - startTime);
      this.metrics.gauge('twitter.affiliates.count', affiliatesData.length);
      
      this.logger.info(`Found ${affiliatesData.length} affiliates for user ${userDetails.userName} (${userId})`);
      return affiliatesData;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Error fetching affiliates for user ${userId}:`, error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('twitter.affiliates.errors');
      this.metrics.timing('twitter.affiliates.error_duration', duration);
      throw error;
    }
  }

  /**
   * Get affiliates for a Twitter user by username
   * @param username Twitter username
   * @param count Maximum number of affiliates to fetch
   * @returns Array of affiliates
   */
  async getUserAffiliatesByUsername(username: string, count: number = 50): Promise<Affiliate[]> {
    try {
      this.logger.info(`Fetching affiliates for username ${username}`);
      
      // Get user details to get the user ID
      const userDetails = await this.twitterClient.getUserDetails(username);
      if (!userDetails) {
        throw new Error(`User ${username} not found`);
      }
      
      return this.getUserAffiliates(userDetails.id, count);
    } catch (error) {
      this.logger.error(`Error fetching affiliates for username ${username}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Check and update affiliates for a specific user
   * @param userIdOrName Twitter user ID or username
   * @returns Array of affiliate changes
   */
  async checkUserAffiliates(userIdOrName: string): Promise<AffiliateChange[]> {
    try {
      this.logger.info(`Checking affiliates for user ${userIdOrName}`);
      
      // Determine if input is a user ID or username
      const isUserId = /^\d+$/.test(userIdOrName);
      
      let userId: string;
      let userName: string;
      
      if (isUserId) {
        userId = userIdOrName;
        const userDetails = await this.twitterClient.getUserDetails(userId);
        if (!userDetails) {
          throw new Error(`User with ID ${userId} not found`);
        }
        userName = userDetails.userName;
      } else {
        // Normalize username
        const normalizedUsername = userIdOrName.replace('@', '').toLowerCase();
        const userDetails = await this.twitterClient.getUserDetails(normalizedUsername);
        if (!userDetails) {
          throw new Error(`User ${normalizedUsername} not found`);
        }
        userId = userDetails.id;
        userName = userDetails.userName;
      }
      
      // Fetch current affiliates from Twitter
      const affiliates = await this.getUserAffiliates(userId);
      
      // Save to database and get changes
      const changes = await this.mongoDBService.saveAffiliates(userId, userName, affiliates);
      
      this.logger.info(`Detected ${changes.length} affiliate changes for user ${userName} (${userId})`);
      return changes;
    } catch (error) {
      this.logger.error(`Error checking affiliates for user ${userIdOrName}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Check affiliates for all tracked accounts
   * @returns Map of user IDs to affiliate changes
   */
  async checkAllAffiliates(): Promise<Map<string, AffiliateChange[]>> {
    const changes = new Map<string, AffiliateChange[]>();
    const { trackedAccounts } = this.configService.getAffiliateTrackingConfig();
    
    this.logger.info(`Checking affiliates for ${trackedAccounts.length} tracked accounts`);
    
    for (const account of trackedAccounts) {
      try {
        const accountChanges = await this.checkUserAffiliates(account);
        if (accountChanges.length > 0) {
          changes.set(account, accountChanges);
        }
      } catch (error) {
        this.logger.error(`Error checking affiliates for ${account}:`, error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    this.logger.info(`Completed affiliate check for ${trackedAccounts.length} accounts, found changes for ${changes.size} accounts`);
    return changes;
  }
}