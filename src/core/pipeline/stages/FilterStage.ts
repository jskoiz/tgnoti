import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../../utils/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { TopicFilterManager } from '../../../bot/TopicFilterManager.js';
import { SearchQueryConfig, AdvancedFilter } from '../../../types/twitter.js';
import { TopicFilter } from '../../../types/filters.js';

@injectable()
export class FilterStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'filter';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TopicFilterManager) private filterManager: TopicFilterManager
  ) {}

  /**
   * Execute the filter stage
   */
  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();
    this.logger.debug('Starting filter stage', {
      topicId: context.topicId,
      tweetId: context.tweet.id
    });

    try {
      // Get topic-specific filters
      const topicFilters = await this.filterManager.getFilters(Number(context.topicId));
      
      // Convert topic filters to advanced filters format
      const advancedFilters = this.convertToAdvancedFilters(topicFilters);
      
      // Apply content filters
      const contentFilterResult = this.applyContentFilters(context, advancedFilters);
      if (!contentFilterResult.passed) {
        return {
          success: false,
          data: context,
          error: new Error('Tweet filtered by content rules'),
          metadata: {
            reason: 'content_filter',
            filter: contentFilterResult.failedFilter,
            details: contentFilterResult.reason
          }
        };
      }

      // Apply user filters
      const userFilterResult = this.applyUserFilters(context, advancedFilters);
      if (!userFilterResult.passed) {
        return {
          success: false,
          data: context,
          error: new Error('Tweet filtered by user rules'),
          metadata: {
            reason: 'user_filter',
            filter: userFilterResult.failedFilter,
            details: userFilterResult.reason
          }
        };
      }

      // Mark tweet as filtered in context
      const updatedContext: TweetContext = {
        ...context,
        filtered: true,
        metadata: {
          ...context.metadata,
          filterDurationMs: Date.now() - startTime,
          appliedFilters: topicFilters.map(f => `${f.type}:${f.value}`)
        }
      };

      this.recordMetrics(startTime, true);

      return {
        success: true,
        data: updatedContext,
        metadata: {
          filterDurationMs: Date.now() - startTime
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Filter stage');
      this.recordMetrics(startTime, false);
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          filterDurationMs: Date.now() - startTime,
          errorType: err.name,
          errorMessage: err.message
        }
      };
    }
  }

  /**
   * Convert topic filters to advanced filters format
   */
  private convertToAdvancedFilters(topicFilters: TopicFilter[]): AdvancedFilter {
    const advancedFilters: AdvancedFilter = {
      exclude_words: [],
      hashtags: [],
      has_media: false,
      has_links: false,
      from_verified: false
    };

    for (const filter of topicFilters) {
      switch (filter.type) {
        case 'keyword':
          if (filter.value.startsWith('-')) {
            advancedFilters.exclude_words?.push(filter.value.substring(1));
          } else if (filter.value.startsWith('#')) {
            advancedFilters.hashtags?.push(filter.value.substring(1));
          }
          break;
        case 'user':
          // Handle user filters
          break;
        case 'mention':
          // Handle mention filters
          break;
      }
    }

    return advancedFilters;
  }

  /**
   * Apply content-based filters
   */
  private applyContentFilters(
    context: TweetContext,
    filters: AdvancedFilter
  ): { passed: boolean; failedFilter?: string; reason?: string } {
    const { tweet } = context;

    // Check for blacklisted words
    if (filters.exclude_words?.length) {
      const hasBlacklistedWord = filters.exclude_words.some(word => 
        tweet.text.toLowerCase().includes(word.toLowerCase())
      );
      if (hasBlacklistedWord) {
        return {
          passed: false,
          failedFilter: 'exclude_words',
          reason: 'Tweet contains blacklisted word'
        };
      }
    }

    // Check for required hashtags
    if (filters.hashtags?.length) {
      const hasRequiredHashtag = filters.hashtags.some(tag =>
        tweet.entities?.hashtags.some(h => h.toLowerCase() === tag.toLowerCase())
      );
      if (!hasRequiredHashtag) {
        return {
          passed: false,
          failedFilter: 'hashtags',
          reason: 'Tweet missing required hashtag'
        };
      }
    }

    // Check for media requirements
    if (filters.has_media && !tweet.media?.length) {
      return {
        passed: false,
        failedFilter: 'has_media',
        reason: 'Tweet missing required media'
      };
    }

    // Check for link requirements
    if (filters.has_links && !tweet.entities?.urls.length) {
      return {
        passed: false,
        failedFilter: 'has_links',
        reason: 'Tweet missing required links'
      };
    }

    return { passed: true };
  }

  /**
   * Apply user-based filters
   */
  private applyUserFilters(
    context: TweetContext,
    filters: AdvancedFilter
  ): { passed: boolean; failedFilter?: string; reason?: string } {
    const { tweet } = context;

    // Check for verified user requirement
    if (filters.from_verified && !tweet.tweetBy.verified) {
      return {
        passed: false,
        failedFilter: 'from_verified',
        reason: 'Tweet not from verified user'
      };
    }

    return { passed: true };
  }

  /**
   * Record filter metrics
   */
  private recordMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.filter.duration', duration);
    this.metrics.increment(`pipeline.filter.${success ? 'success' : 'failure'}`);
  }
}