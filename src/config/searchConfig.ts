import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { ConfigManager, ConfigValidation } from './ConfigManager.js';

export interface TopicSearchConfig {
  enableAgeFiltering?: boolean;
  windowMinutes?: number;
  enableUsernameFiltering?: boolean;
  enableContentFiltering?: boolean;
  overlapBufferMinutes?: number;
}

interface SearchWindow {
  startDate: Date;
  endDate: Date;
  lastProcessed: Date;
  processed: boolean;
}

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
  private readonly defaultOverlapBufferMinutes = 2; // Increased to 2-minute overlap
  private readonly defaultPastDays = 3; // Reduced to 3 days in the past
  private readonly defaultFutureDays = 1; // Default to 1 day in the future
  // Track active search windows by topicId
  private activeWindows: Map<string, SearchWindow> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager
  ) {
    // Register validation for SEARCH_WINDOW_MINUTES
    const searchWindowValidation: ConfigValidation<string> = {
      validate: (value: string) => {
        const num = Number(value);
        return !isNaN(num) && num > 0 && num <= 1440; // Allow up to 24 hours (1440 minutes)
      },
      message: 'SEARCH_WINDOW_MINUTES must be a number between 1 and 1440 (24 hours)',
      example: 'SEARCH_WINDOW_MINUTES=10',
      required: ['A positive number between 1 and 1440 (24 hours)']
    };
    
    this.configManager.registerValidation('SEARCH_WINDOW_MINUTES', searchWindowValidation);
    
    // Log the configured search window
    const configuredWindow = this.getSearchWindowMinutes();
    this.logger.debug(`Initialized SearchConfig with window: ${configuredWindow} minutes`);
  }

  /**
   * Validate if a search window has already been processed
   * Returns true if window is valid for processing, false if already processed
   */
  async validateSearchWindow(
    topicId: string,
    window: { startDate: Date; endDate: Date }
  ): Promise<boolean> {
    const existingWindow = this.activeWindows.get(topicId);
    
    if (!existingWindow) {
      // No existing window, create new one
      this.activeWindows.set(topicId, {
        ...window,
        lastProcessed: new Date(),
        processed: false
      });
      return true;
    }

    // Only reject if the new window is completely contained within the existing window
    // This allows for partial overlap between consecutive windows
    const overlap = (
      window.startDate >= existingWindow.startDate &&
      window.endDate <= existingWindow.endDate
    );
    
    if (overlap && existingWindow.processed) {
      this.logger.debug('Skipping already processed window', {
        topicId,
        existing: {
          start: existingWindow.startDate,
          end: existingWindow.endDate
        },
        new: {
          start: window.startDate,
          end: window.endDate
        }
      });
      return false;
    }

    // Update window
    this.activeWindows.set(topicId, {
      ...window,
      lastProcessed: new Date(),
      processed: false
    });
    return true;
  }

  /**
   * Create a search window for tweet fetching
   * By default, creates a window from (now - windowMinutes) to now
   */
  async createSearchWindow(): Promise<{ startDate: Date; endDate: Date }> {
    const windowMinutes = Number(this.configManager.getEnvConfig<string>('SEARCH_WINDOW_MINUTES')) || this.defaultWindowMinutes;
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (windowMinutes * 60 * 1000));

    // Clean up old windows
    const now = new Date();
    for (const [topicId, window] of this.activeWindows.entries()) {
      const windowAge = now.getTime() - window.lastProcessed.getTime();
      const maxAge = windowMinutes * 2 * 60 * 1000; // 2x window size
      
      if (windowAge > maxAge) {
        this.logger.debug('Cleaning up old search window', {
          topicId, windowAge: windowAge / 1000
        });
        this.activeWindows.delete(topicId);
      }
    }

    return { startDate, endDate };
  }

  /**
   * Get the configured search window size in minutes
   */
  getSearchWindowMinutes(): number {
    const envValue = this.configManager.getEnvConfig<string>('SEARCH_WINDOW_MINUTES');
    return Number(envValue) || this.defaultWindowMinutes;
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

  /**
   * Get topic-specific search configuration
   * Falls back to global defaults if topic config not found
   */
  async getTopicConfig(topicId: string): Promise<TopicSearchConfig> {
    try {
      const prefix = `TOPIC_${topicId}_`;
      const enableAgeFiltering = this.configManager.getEnvConfig<string>(`${prefix}ENABLE_AGE_FILTERING`);
      const windowMinutes = this.configManager.getEnvConfig<string>(`${prefix}WINDOW_MINUTES`);
      const enableUsernameFiltering = this.configManager.getEnvConfig<string>(`${prefix}ENABLE_USERNAME_FILTERING`);
      const enableContentFiltering = this.configManager.getEnvConfig<string>(`${prefix}ENABLE_CONTENT_FILTERING`);
      const overlapBufferMinutes = this.configManager.getEnvConfig<string>(`${prefix}OVERLAP_BUFFER_MINUTES`);

      return {
        enableAgeFiltering: enableAgeFiltering === 'false' ? false : true,
        windowMinutes: Number(windowMinutes) || this.getSearchWindowMinutes(),
        enableUsernameFiltering: enableUsernameFiltering === 'false' ? false : true,
        enableContentFiltering: enableContentFiltering === 'false' ? false : true,
        overlapBufferMinutes: Number(overlapBufferMinutes) || this.getOverlapBufferMinutes()
      };
    } catch (error: unknown) {
      this.logger.error('Failed to get topic config', error instanceof Error ? error : new Error(String(error)), {
        topicId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Return default config on error
      return {
        enableAgeFiltering: true,
        windowMinutes: this.getSearchWindowMinutes(),
        enableUsernameFiltering: true,
        enableContentFiltering: true,
        overlapBufferMinutes: this.getOverlapBufferMinutes()
      };
    }
  }

  /**
   * Mark a search window as processed
   */
  markWindowProcessed(topicId: string): void {
    const window = this.activeWindows.get(topicId);
    if (window) {
      window.processed = true;
      this.activeWindows.set(topicId, window);
    }
  }
}
