import { injectable, inject } from 'inversify';
import { TweetFilter } from 'rettiwt-api';
import { Logger } from '../../types/logger.js';
import { SearchQueryConfig, QueryGroup, AdvancedFilter } from '../../types/twitter.js';
import { TYPES } from '../../types/di.js';
import { MetricsManager } from '../../core/monitoring/MetricsManager.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';

interface FilterValidationResult {
  valid: boolean;
  errors: string[];
}

@injectable()
export class RettiwtSearchBuilder {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics?: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler?: ErrorHandler
  ) {}

  /**
   * Build a simple word-based search filter
   */
  buildSimpleWordSearch(word: string): TweetFilter {
    try {
      this.validateWord(word);

      const filter = {
        includeWords: [word.toLowerCase()],
        language: 'en',
        links: false,
        replies: true,
        minLikes: 0,
        minReplies: 0,
        minRetweets: 0
      };

      this.logger.debug(`Built simple word search filter: ${JSON.stringify(filter)}`);
      this.metrics?.increment('search.filters.simple');
      return new TweetFilter(filter);
    } catch (error) {
      this.metrics?.increment('search.filters.errors');
      const validationError = this.errorHandler?.createValidationError(
        'Invalid word search filter',
        { word, error: error instanceof Error ? error.message : String(error) }
      );
      throw validationError || error;
    }
  }

  /**
   * Build a complex search filter from configuration
   */
  buildFilter(config: SearchQueryConfig): TweetFilter {
    const startTime = Date.now();
    try {
      // Validate configuration
      const validationResult = this.validateConfig(config);
      if (!validationResult.valid) {
        throw new Error(validationResult.errors.join(', '));
      }

      // Build search criteria with complex query support
      const includeWords = this.buildComplexSearchCriteria(config);
      
      // Build filter with all options
      const fromUsers = config.accounts?.map((a: string) => a.replace(/^@/, '')) || [];
      const mentions = config.mentions?.map((m: string) => m.replace(/^@/, '')) || [];
      
      // Ensure includeWords has at least one term by using account names if no keywords
      const searchTerms = config.keywords?.map((k: string) => k.toLowerCase()) || [];
      
      const filter = {
        fromUsers: fromUsers, // Use the full array of users
        mentions: mentions,   // Include tweets mentioning these users
        includeWords: searchTerms, // Include keywords in the search
        language: config.language,
        startDate: config.startTime ? new Date(config.startTime) : undefined,
        endDate: config.endTime ? new Date(config.endTime) : undefined,
        links: false,
        retweets: false,  // Always exclude retweets
        quotes: false,    // Always exclude quotes
        minLikes: config.minLikes || 0,
        minRetweets: config.minRetweets || 0,
        minReplies: config.minReplies || 0,
        operator: 'AND',  // Force AND operator to ensure strict user matching
        // Add advanced filter options
        hasMedia: config.advancedFilters?.has_media,
        hasLinks: config.advancedFilters?.has_links ?? false,
        replies: false, // Don't include replies to the user, only tweets from them
        excludeWords: config.advancedFilters?.excludeWords,
        includePhrase: config.advancedFilters?.includePhrase
      };

      this.logger.debug('Built filter from config:', {
        fromUsers: filter.fromUsers,
        operator: filter.operator,
        includeWords: filter.includeWords,
        mentions: filter.mentions,
        startDate: filter.startDate,
        endDate: filter.endDate,
        retweets: filter.retweets,
        quotes: filter.quotes,
        replies: filter.replies
      });
      this.metrics?.increment('search.filters.complex');
      this.metrics?.timing('search.filter_build_time', Date.now() - startTime);

      return new TweetFilter(filter);
    } catch (error) {
      this.metrics?.increment('search.filters.errors');
      const validationError = this.errorHandler?.createValidationError(
        'Invalid search filter configuration',
        { config, error: error instanceof Error ? error.message : String(error) }
      );
      throw validationError || error;
    }
  }

  /**
   * Validate search configuration
   */
  private validateConfig(config: SearchQueryConfig): FilterValidationResult {
    const errors: string[] = [];

    // Check type
    if (!config.type || config.type !== 'structured') {
      errors.push('Search type must be "structured"');
    }

    // Check search criteria
    if (!config.keywords?.length && !config.accounts?.length && !config.mentions?.length) {
      errors.push('At least one search criteria (keywords, accounts, or mentions) must be provided');
    }

    // Validate keywords
    if (config.keywords?.length) {
      config.keywords.forEach((word: string, index: number) => {
        try {
          this.validateWord(word);
        } catch (error) {
          errors.push(`Invalid keyword at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }

    // Validate accounts
    if (config.accounts?.length) {
      config.accounts.forEach((account: string, index: number) => {
        if (!/^@?[\w]{1,15}$/.test(account)) {
          errors.push(`Invalid account at index ${index}: ${account}`);
        }
      });
    }

    // Validate mentions
    if (config.mentions?.length) {
      config.mentions.forEach((mention: string, index: number) => {
        if (!/^@?[\w]{1,15}$/.test(mention)) {
          errors.push(`Invalid mention at index ${index}: ${mention}`);
        }
      });
    }

    // Validate language
    if (!config.language || !/^[a-z]{2}$/.test(config.language)) {
      errors.push('Language must be a valid 2-letter code');
    }

    // Validate dates if present
    if (config.startTime) {
      try {
        new Date(config.startTime).toISOString();
      } catch {
        errors.push('Invalid startTime format');
      }
    }

    if (config.endTime) {
      try {
        new Date(config.endTime).toISOString();
      } catch {
        errors.push('Invalid endTime format');
      }
    }

    // Validate engagement metrics
    if (config.minLikes !== undefined && (typeof config.minLikes !== 'number' || config.minLikes < 0)) {
      errors.push('minLikes must be a non-negative number');
    }

    if (config.minRetweets !== undefined && (typeof config.minRetweets !== 'number' || config.minRetweets < 0)) {
      errors.push('minRetweets must be a non-negative number');
    }

    if (config.minReplies !== undefined && (typeof config.minReplies !== 'number' || config.minReplies < 0)) {
      errors.push('minReplies must be a non-negative number');
    }

    // Validate operator if present
    if (config.operator && !['AND', 'OR', 'NOT'].includes(config.operator)) {
      errors.push('operator must be either "AND", "OR", or "NOT"');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Build complex search criteria from configuration including query groups
   */
  private buildComplexSearchCriteria(config: SearchQueryConfig): string[] {
    const baseCriteria = config.keywords?.map((k: string) => k.toLowerCase()) || [];
    
    if (!config.queryGroups?.length) {
      return baseCriteria;
    }

    const groupCriteria = config.queryGroups.map((group: QueryGroup) => 
      this.buildQueryGroup(group)
    );

    return [...baseCriteria, ...groupCriteria];
  }

  /**
   * Build a query group into search criteria
   */
  private buildQueryGroup(group: QueryGroup): string {
    const conditions = group.conditions.map((condition: string | QueryGroup) => {
      if (typeof condition === 'string') {
        return this.validateAndFormatCondition(condition);
      }
      return this.buildQueryGroup(condition);
    });

    // Handle NOT operator differently
    if (group.operator === 'NOT') {
      return `-${conditions.join(' -')}`;
    }

    // Group conditions with parentheses for AND/OR
    return `(${conditions.join(` ${group.operator} `)})`;
  }

  /**
   * Validate and format a single condition
   */
  private validateAndFormatCondition(condition: string): string {
    this.validateWord(condition);
    return condition.toLowerCase();
  }

  /**
   * Validate advanced filters
   */
  private validateAdvancedFilters(filters?: AdvancedFilter): FilterValidationResult {
    const errors: string[] = [];

    if (filters?.hashtags?.length) {
      filters.hashtags.forEach((tag: string, i: number) => {
        if (!/^#[\w]+$/.test(tag)) {
          errors.push(`Invalid hashtag at index ${i}: ${tag}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate a single search word
   */
  private validateWord(word: string): void {
    if (!word || typeof word !== 'string') {
      throw new Error('Search word must be a non-empty string');
    }

    if (word.length > 128) {
      throw new Error('Search word must not exceed 128 characters');
    }

    // Check for invalid characters
    if (!/^[\w\s#@-]+$/i.test(word)) {
      throw new Error('Search word contains invalid characters');
    }
  }
}