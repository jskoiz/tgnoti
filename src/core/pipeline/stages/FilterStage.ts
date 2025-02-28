import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { TopicFilterManager } from '../../../telegram/bot/TopicFilterManager.js';
import { UsernameHandler } from '../../../utils/usernameHandler.js';
import { SearchConfig } from '../../../config/searchConfig.js';

@injectable()
export class FilterStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'filter';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TopicFilterManager) private filterManager: TopicFilterManager,
    @inject(TYPES.UsernameHandler) private usernameHandler: UsernameHandler,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig
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
      // Check tweet age first
      const tweetDate = new Date(context.tweet.createdAt);
      const now = new Date();
      const tweetAgeMinutes = (now.getTime() - tweetDate.getTime()) / (60 * 1000);
      const configuredWindow = this.searchConfig.getSearchWindowMinutes();
      
      this.logger.debug('Tweet age check', {
        tweetId: context.tweet.id,
        tweetDate: tweetDate.toISOString(),
        tweetAgeMinutes: tweetAgeMinutes.toFixed(2),
        configuredWindow
      });

      if (tweetAgeMinutes > configuredWindow) {
        return {
          success: false,
          data: context,
          error: new Error(`Tweet too old: ${tweetAgeMinutes.toFixed(2)} minutes`),
          metadata: {
            reason: 'tweet_too_old'
          }
        };
      }

      // Get topic-specific filters
      const topicFilters = await this.filterManager.getFilters(Number(context.topicId));
      
      // Require at least one filter to be configured
      if (topicFilters.length === 0) {
        return {
          success: false,
          data: context,
          error: new Error('No filters configured for topic'),
          metadata: {
            reason: 'no_filters'
          }
        };
      }

      // Get the username filter
      const usernameFilter = topicFilters.find(f => f.type === 'user' || f.type === 'mention');
      if (!usernameFilter) {
        return {
          success: false,
          data: context,
          error: new Error('No username filter configured'),
          metadata: { reason: 'no_username_filter' }
        };
      }

      // Enhanced logging for username debugging
      const normalizedFilterUsername = this.usernameHandler.normalizeUsername(usernameFilter.value);
      const normalizedTweetUsername = this.usernameHandler.normalizeUsername(context.tweet.tweetBy.userName);
      const normalizedMentions = context.tweet.entities?.mentionedUsers?.map(u => 
        this.usernameHandler.normalizeUsername(u)
      ) || [];

      // Log detailed username information
      this.logger.debug('Username comparison details', {
        tweetId: context.tweet.id,
        filterUsername: {
          original: usernameFilter.value,
          normalized: normalizedFilterUsername
        },
        tweetBy: {
          original: context.tweet.tweetBy.userName,
          normalized: normalizedTweetUsername
        },
        mentions: {
          original: context.tweet.entities?.mentionedUsers || [],
          normalized: normalizedMentions
        },
        tweetText: context.tweet.text
      });
      
      // Check if tweet is relevant to the user
      if (!this.usernameHandler.isTweetRelevantToUser(context.tweet, usernameFilter.value)) {
        return {
          success: false,
          data: context,
          error: new Error('Tweet does not contain username'),
          metadata: {
            reason: 'missing_username',
            details: {
              expectedUsername: normalizedFilterUsername,
              tweetUsername: normalizedTweetUsername,
              mentions: normalizedMentions
            }
          }
        };
      }

      // Mark tweet as filtered in context
      const updatedContext: TweetContext = {
        ...context,
        filtered: true,
        metadata: {
          ...context.metadata,
          filter: {
            matched: true,
            rules: [`username:${usernameFilter.value}`],
            filterDurationMs: Date.now() - startTime
          }
        }
      };

      this.recordMetrics(startTime, true);

      return {
        success: true,
        data: updatedContext,
        metadata: {
          filter: {
            matched: true,
            rules: [`username:${usernameFilter.value}`],
            filterDurationMs: Date.now() - startTime
          }
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
          filter: {
            matched: false,
            rules: [],
            filterDurationMs: Date.now() - startTime
          },
          error: { type: err.name, message: err.message }
        }
      };
    }
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