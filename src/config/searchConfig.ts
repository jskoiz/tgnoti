import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { ConfigManager, ConfigValidation } from './ConfigManager.js';

/**
 * SearchConfig provides configuration for tweet search windows
 * 
 * This class has been updated to use a sliding window approach with:
 * - defaultWindowMinutes: The size of the search window in minutes
 * - overlapBufferMinutes: Buffer to ensure no tweets are missed between polls
 */

@injectable()
export class SearchConfig {
  private readonly defaultWindowMinutes = 5; // Default to 5-minute window
  private readonly defaultOverlapBufferMinutes = 1; // Default to 1-minute overlap
  private readonly defaultPastDays = 7; // Default to 7 days in the past
  private readonly defaultFutureDays = 1; // Default to 1 day in the future

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager
  ) {
    // Register validation for SEARCH_WINDOW_MINUTES
    const searchWindowValidation: ConfigValidation<string> = {
      validate: (value: string) => {
        const num = Number(value);
        return !isNaN(num) && num > 0 && num <= 60;
      },
      message: 'SEARCH_WINDOW_MINUTES must be a number between 1 and 60',
      example: 'SEARCH_WINDOW_MINUTES=10',
      required: ['A positive number between 1 and 60']
    };
    
    this.configManager.registerValidation('SEARCH_WINDOW_MINUTES', searchWindowValidation);
    
    // Log the configured search window
    const configuredWindow = this.getSearchWindowMinutes();
    this.logger.info(`Initialized SearchConfig with window: ${configuredWindow} minutes`);
  }

  /**
   * Create a search window for tweet fetching
   * By default, creates a window from (now - windowMinutes) to now
   */
  async createSearchWindow(): Promise<{ startDate: Date; endDate: Date }> {
    const windowMinutes = Number(this.configManager.getEnvConfig<string>('SEARCH_WINDOW_MINUTES')) || this.defaultWindowMinutes;
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (windowMinutes * 60 * 1000));

    this.logger.debug('Created search window', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      windowMinutes
    });

    return { startDate, endDate };
  }

  /**
   * Get the configured search window size in minutes
   */
  getSearchWindowMinutes(): number {
    const envValue = this.configManager.getEnvConfig<string>('SEARCH_WINDOW_MINUTES');
    const windowMinutes = Number(envValue) || this.defaultWindowMinutes;
    
    this.logger.debug('Getting search window minutes', {
      envValue,
      parsedValue: Number(envValue),
      finalValue: windowMinutes,
      source: envValue ? 'environment' : 'default'
    });
    
    return windowMinutes;
  }

  /**
   * Get the configured overlap buffer in minutes
   * This is used to ensure no tweets are missed between polling intervals
   */
  getOverlapBufferMinutes(): number {
    return Number(this.configManager.getEnvConfig<string>('SEARCH_OVERLAP_BUFFER_MINUTES')) || 
           this.defaultOverlapBufferMinutes;
  }

  /**
   * Get the configured past days limit for search windows
   * 
   * Note: This is maintained for backward compatibility with existing validation code
   * This is used for validating search windows and tweet dates
   */
  getPastDays(): number {
    return Number(this.configManager.getEnvConfig<string>('SEARCH_PAST_DAYS')) || 
           this.defaultPastDays;
  }

  /**
   * Get the configured future days limit for search windows
   * 
   * Note: This is maintained for backward compatibility with existing validation code
   * This is used for validating search windows and tweet dates
   */
  getFutureDays(): number {
    return Number(this.configManager.getEnvConfig<string>('SEARCH_FUTURE_DAYS')) || 
           this.defaultFutureDays;
  }

}