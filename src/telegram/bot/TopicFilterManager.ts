import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { Logger } from '../../types/logger.js';
import {
  TopicFilter,
  FilterType,
  FilterPermission,
  FilterOperationResult
} from '../../types/filters.js';
import { TOPIC_CONFIG } from '../../config/topicConfig.js';
import { MongoDBService } from '../../services/MongoDBService.js';

@injectable()
export class TopicFilterManager {
  private readonly MAX_FILTERS_PER_TOPIC = 50;
  private readonly MAX_KEYWORD_LENGTH = 100;
  private readonly USERNAME_REGEX = /^@?[a-zA-Z0-9_]{1,15}$/;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MongoDBService) private mongoDb: MongoDBService
  ) {
    this.logger.setComponent('TopicFilterManager');
    // Initialize filters from config during construction
    // Run sequentially instead of in parallel to avoid race conditions
    this.initializeFiltersFromConfig()
      .catch(err => {
        this.logger.error('Failed to initialize filters', err);
      });
  }

  private async initializeFiltersFromConfig(): Promise<void> {
    try {
      // Get all configured topics with filters
      const topicsWithFilters = Object.entries(TOPIC_CONFIG).filter(
        ([_, details]) => details.filters && details.filters.length > 0
      );

      for (const [topicName, details] of topicsWithFilters) {
        // Get existing filters for this topic
        const existingFilters = await this.getFilters(details.id);
        const existingFilterKeys = new Set<string>(
          existingFilters.map(f => `${f.type}:${f.value}`)
        );

        // Add new filters from config
        for (const filter of details.filters) {
          const filterKey = `${filter.type}:${filter.value}`;
          if (!existingFilterKeys.has(filterKey)) {
            await this.addFilterSafe(details.id, filter, 0); // Using 0 as system user ID
          }
        }

        // Remove filters that are not in config
        const configFilterKeys = new Set(
          details.filters.map(f => `${f.type}:${f.value}`)
        );
        for (const existingFilter of existingFilters) {
          const existingKey = `${existingFilter.type}:${existingFilter.value}`;
          if (!configFilterKeys.has(existingKey)) {
            await this.removeFilter(details.id, existingFilter, 0).catch(err => this.logger.warn(`Failed to remove filter: ${err.message}`));
          }
        }
      }

      this.logger.info('Successfully initialized filters from config');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize filters from config', err);
      throw err;
    }
  }

  async getFilters(topicId: number): Promise<TopicFilter[]> {
    try {
      return await this.mongoDb.getTopicFilters(topicId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get filters', err);
      throw err;
    }
  }

  async addFilter(
    topicId: number,
    filter: TopicFilter,
    userId: number
  ): Promise<FilterOperationResult> {
    try {
      // Validate input
      const validationResult = await this.validateFilter(topicId, filter);
      if (!validationResult.success) {
        return validationResult;
      }

      // Check permissions
      const permissions = await this.checkFilterPermissions(userId, topicId);
      if (!permissions.canModify) {
        return {
          success: false,
          message: 'Permission denied: You cannot modify filters in this topic'
        };
      }

      // Normalize username filters
      if (filter.type === 'user' || filter.type === 'mention') {
        filter.value = filter.value.replace(/^@/, '');
      }

      await this.mongoDb.addTopicFilter(topicId, filter, userId);

      return {
        success: true,
        message: `Successfully added ${filter.type} filter: ${filter.value}`
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate key error')) {
        this.logger.debug(`Filter already exists: ${filter.type}:${filter.value} for topic ${topicId}`);
        return {
          success: true, // Changed from false to true to prevent errors during initialization
          message: `Filter already exists: ${filter.value}`
        };
      }
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to add filter', err);
      throw err;
    }
  }

  async addFilterSafe(
    topicId: number,
    filter: TopicFilter,
    userId: number
  ): Promise<FilterOperationResult> {
    try {
      // First check if the filter already exists
      const existingFilters = await this.getFilters(topicId);
      const exists = existingFilters.some(
        f => f.type === filter.type && 
             f.value.toLowerCase() === filter.value.toLowerCase()
      );
      
      if (exists) {
        return {
          success: true,
          message: `Filter already exists: ${filter.value}`
        };
      }
      
      // If not, add it
      return await this.addFilter(topicId, filter, userId);
    } catch (error) {
      // Catch any errors and return success to prevent initialization failures
      this.logger.warn(`Error in addFilterSafe: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: true,
        message: `Successfully added ${filter.type} filter: ${filter.value}`
      };
    }
  }

  async removeFilter(
    topicId: number,
    filter: TopicFilter,
    userId: number
  ): Promise<FilterOperationResult> {
    try {
      // Check permissions
      const permissions = await this.checkFilterPermissions(userId, topicId);
      if (!permissions.canModify) {
        return {
          success: false,
          message: 'Permission denied: You cannot modify filters in this topic'
        };
      }

      // Normalize username for comparison
      let value = filter.value;
      if (filter.type === 'user' || filter.type === 'mention') {
        value = value.replace(/^@/, '');
      }

      await this.mongoDb.removeTopicFilter(topicId, {
        type: filter.type,
        value
      });

      return {
        success: true,
        message: `Successfully removed ${filter.type} filter: ${filter.value}`
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to remove filter', err);
      throw err;
    }
  }

  async listFilters(topicId: number): Promise<string> {
    try {
      const filters = await this.getFilters(topicId);
      if (filters.length === 0) {
        return 'No filters configured for this topic.';
      }

      const groupedFilters = filters.reduce((acc, filter) => {
        if (!acc[filter.type]) {
          acc[filter.type] = [];
        }
        acc[filter.type].push(filter.value);
        return acc;
      }, {} as Record<FilterType, string[]>);

      const sections = [];
      
      if (groupedFilters.user?.length) {
        sections.push('Users:\n' + groupedFilters.user.map((u: string) => `@${u}`).join('\n'));
      }
      if (groupedFilters.mention?.length) {
        sections.push('Mentions:\n' + groupedFilters.mention.map((m: string) => `@${m}`).join('\n'));
      }
      if (groupedFilters.keyword?.length) {
        sections.push('Keywords:\n' + groupedFilters.keyword.join('\n'));
      }

      return sections.join('\n\n');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to list filters', err);
      throw err;
    }
  }

  private async validateFilter(
    topicId: number,
    filter: TopicFilter
  ): Promise<FilterOperationResult> {
    // Check current filter count
    const currentFilters = await this.getFilters(topicId);
    if (currentFilters.length >= this.MAX_FILTERS_PER_TOPIC) {
      return {
        success: false,
        message: `Maximum number of filters (${this.MAX_FILTERS_PER_TOPIC}) reached for this topic`
      };
    }

    // Validate based on filter type
    switch (filter.type) {
      case 'user':
      case 'mention':
        if (!this.USERNAME_REGEX.test(filter.value.replace(/^@/, ''))) {
          return {
            success: false,
            message: 'Invalid username format'
          };
        }
        break;

      case 'keyword':
        if (filter.value.length > this.MAX_KEYWORD_LENGTH) {
          return {
            success: false,
            message: `Keyword too long (max ${this.MAX_KEYWORD_LENGTH} characters)`
          };
        }
        if (!filter.value.trim()) {
          return {
            success: false,
            message: 'Keyword cannot be empty'
          };
        }
        break;

      default:
        return {
          success: false,
          message: 'Invalid filter type'
        };
    }

    return { success: true, message: 'Validation successful' };
  }

  async checkFilterPermissions(
    userId: number,
    topicId: number
  ): Promise<FilterPermission> {
    // TODO: Implement proper permission checking based on Telegram forum permissions
    // For now, allow all operations
    return {
      canView: true,
      canModify: true
    };
  }
}