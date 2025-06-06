import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { Tweet } from '../types/twitter.js';
import axios from 'axios';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { SearchConfig } from '../config/searchConfig.js';
import { IDateValidator } from '../types/dateValidator.js';

export class DateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateValidationError';
  }
}

interface OnlineTimeCache {
  timestamp: number;
  date: Date;
}

@injectable()
export class DateValidator implements IDateValidator {
  private cachedOnlineTime: OnlineTimeCache | null = null;
  private _searchConfig?: SearchConfig;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {}

  /**
   * Gets the current time from an online source
   * Caches the result for 1 minute to avoid excessive API calls
   */
  async getCurrentTime(): Promise<Date> {
    if (!this._searchConfig) {
      throw new Error('DateValidator not fully initialized - searchConfig missing');
    }
    return this.getOnlineTime();
  }

  // Internal method for getting online time
  private async getOnlineTime(): Promise<Date> {
    const CACHE_DURATION = 60000; // 1 minute cache
    const REQUEST_TIMEOUT = 3000; // 3 second timeout

    // Return cached time if valid
    if (this.cachedOnlineTime && 
        Date.now() - this.cachedOnlineTime.timestamp < CACHE_DURATION) {
      return new Date(this.cachedOnlineTime.date);
    }

    try {
      // Try primary time API with timeout
      try {
        const response = await axios.get('http://worldtimeapi.org/api/ip', {
          timeout: REQUEST_TIMEOUT
        });
        const onlineTime = new Date(response.data.datetime);
        this.cachedOnlineTime = { timestamp: Date.now(), date: onlineTime };
        return onlineTime;
      } catch (error) {
        this.logger.warn('Primary time API failed, falling back to system time');
        const systemTime = new Date();
        this.cachedOnlineTime = { timestamp: Date.now(), date: systemTime };
        return systemTime;
      }
    } catch (error) {
      this.logger.warn('Failed to get online time, falling back to system time');
      const systemTime = new Date();
      this.cachedOnlineTime = { timestamp: Date.now(), date: systemTime };
      return systemTime;
    }
  }

  // Method to set searchConfig after initialization
  setSearchConfig(searchConfig: SearchConfig): void {
    this._searchConfig = searchConfig;
  }

  // Getter for searchConfig to ensure it's available
  private get searchConfig(): SearchConfig {
    if (!this._searchConfig) {
      throw new Error('DateValidator not fully initialized - searchConfig missing');
    }
    return this._searchConfig;
  }

  /**
   * Validates the current system time
   */
  async validateSystemTime(): Promise<void> {
    const onlineTime = await this.getOnlineTime();
    const systemTime = new Date();
    
    // Check if system time is too far in the future
    const maxAllowedTime = new Date(onlineTime.getTime() + (24 * 60 * 60 * 1000)); // Allow max 1 day ahead
    if (systemTime > maxAllowedTime) {
      const error = new DateValidationError(
        `System time ${systemTime.toISOString()} is too far ahead of online time ${onlineTime.toISOString()}`
      );
      this.logger.error('System time validation failed:', error);
      throw error;
    }

    this.logger.info(`System time validated: ${systemTime.toISOString()}`);
    this.logger.debug(`Online time reference: ${onlineTime.toISOString()}`);
    this.metrics.increment('date.validation.success');
  }

  /**
   * Validates a search window's start and end dates
   */
  async validateSearchWindow(startDate: Date, endDate: Date): Promise<void> {
    const now = await this.getOnlineTime();
    
    // Get configuration values with fallbacks to ensure backward compatibility
    // This handles both the old (pastDays/futureDays) and new (windowMinutes) configurations
    const pastDays = this.searchConfig.getPastDays ? 
      this.searchConfig.getPastDays() : 
      7; // Default to 7 days if method doesn't exist
    const futureDays = this.searchConfig.getFutureDays ? 
      this.searchConfig.getFutureDays() : 1; // Default to 1 day if method doesn't exist

    if (startDate > endDate) {
      const error = new DateValidationError(
        `Search window start date ${startDate.toISOString()} is after ` +
        `end date ${endDate.toISOString()}`
      );
      this.logger.error('Search window validation failed:', error);
      this.metrics.increment('date.validation.errors');
      throw error;
    }

    const maxPastDate = new Date(now.getTime() - (pastDays * 24 * 60 * 60 * 1000));
    const maxFutureDate = new Date(now.getTime() + (futureDays * 24 * 60 * 60 * 1000));

    if (startDate < maxPastDate) {
      const error = new DateValidationError(
        `Search window start date ${startDate.toISOString()} is too far in the past. ` +
        `Must not be more than ${pastDays} days ago.`
      );
      this.logger.error('Search window validation failed:', error);
      this.metrics.increment('date.validation.errors');
      throw error;
    }

    if (endDate > maxFutureDate) {
      const error = new DateValidationError(
        `Search window end date ${endDate.toISOString()} is too far in the future. ` +
        `Must not be more than ${futureDays} days ahead.`
      );
      this.logger.error('Search window validation failed:', error);
      this.metrics.increment('date.validation.errors');
      throw error;
    }

    this.logger.debug(
      `Search window validated: ${startDate.toISOString()} to ${endDate.toISOString()}`
    );
    this.metrics.increment('date.validation.success');
  }

  /**
   * Validates a tweet's creation date
   */
  async validateTweetDate(tweet: Tweet): Promise<boolean> {
    const tweetDate = new Date(tweet.createdAt);
    const windowMinutes = this.searchConfig.getSearchWindowMinutes();
    const now = await this.getOnlineTime();
    
    // Get configuration values with fallbacks to ensure backward compatibility
    // This handles both the old (pastDays/futureDays) and new (windowMinutes) configurations
    const pastDays = this.searchConfig.getPastDays ? 
      this.searchConfig.getPastDays() : 
      7; // Default to 7 days if method doesn't exist
    const futureDays = this.searchConfig.getFutureDays ? 
      this.searchConfig.getFutureDays() : 1; // Default to 1 day if method doesn't exist
    
    // Log the validation details
    this.logger.debug('Tweet date validation', {
      tweetId: tweet.id,
      tweetDate: tweetDate.toISOString(),
      currentTime: now.toISOString(),
      configuredWindow: {
        minutes: windowMinutes,
        pastDays,
        futureDays
      }
    });
    // Calculate valid date range
    const maxPastDate = new Date(now.getTime() - (pastDays * 24 * 60 * 60 * 1000));
    const maxFutureDate = new Date(now.getTime() + (futureDays * 24 * 60 * 60 * 1000));

    // Reject tweets from the future
    if (tweetDate > maxFutureDate) {
      this.logger.warn(
        `Tweet ${tweet.id} has date ${tweetDate.toISOString()} beyond ` +
        `maximum allowed date ${maxFutureDate.toISOString()}`
      );
      this.metrics.increment('date.validation.errors');
      return false;
    }

    // Reject tweets too far in the past
    if (tweetDate < maxPastDate) {
      this.logger.warn(
        `Tweet ${tweet.id} has date ${tweetDate.toISOString()} before ` +
        `minimum allowed date ${maxPastDate.toISOString()}`
      );
      this.metrics.increment('date.validation.errors');
      return false;
    }

    this.logger.debug(
      `Tweet ${tweet.id} date validated: ${tweetDate.toISOString()}`
    );
    this.metrics.increment('date.validation.success');
    return true;
  }
}