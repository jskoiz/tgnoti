import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { Storage } from '../../../storage/storage.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../../utils/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { SearchQueryConfig } from '../../../types/twitter.js';

@injectable()
export class ValidationStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'validation';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler
  ) {}

  /**
   * Execute the validation stage
   */
  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();
    this.logger.debug('Starting validation stage', {
      topicId: context.topicId,
      tweetId: context.tweet.id
    });

    try {
      // Skip duplicate check if in migration mode
      const seen = !context.isMigration && 
        await this.storage.hasSeen(context.tweet.id, context.topicId);
      if (seen) {
        return {
          success: false,
          data: context,
          error: new Error('Tweet was already processed'),
          metadata: {
            reason: 'duplicate',
            tweetId: context.tweet.id,
            topicId: context.topicId
          }
        };
      }

      // Validate tweet content
      const contentValidation = this.validateTweetContent(context);
      if (!contentValidation.valid) {
        return {
          success: false,
          data: context,
          error: new Error(contentValidation.reason),
          metadata: {
            reason: 'content_validation',
            details: contentValidation.reason
          }
        };
      }

      // Validate engagement metrics if configured
      const config = await this.storage.getConfig();
      const searchConfig = config.twitter.searchQueries[context.topicId] as SearchQueryConfig;
      
      if (!this.validateEngagementMetrics(context, searchConfig)) {
        return {
          success: false,
          data: context,
          error: new Error('Tweet does not meet engagement criteria'),
          metadata: {
            reason: 'engagement_metrics',
            metrics: {
              likes: context.tweet.likeCount,
              retweets: context.tweet.retweetCount,
              replies: context.tweet.replyCount
            },
            required: {
              minLikes: searchConfig.minLikes,
              minRetweets: searchConfig.minRetweets,
              minReplies: searchConfig.minReplies
            }
          }
        };
      }

      // Mark tweet as validated in context
      const updatedContext: TweetContext = {
        ...context,
        validated: true,
        metadata: {
          ...context.metadata,
          validation: {
            isValid: true,
            isMigration: context.isMigration
          }
        }
      };

      this.recordMetrics(startTime, true);

      return {
        success: true,
        data: updatedContext,
        metadata: {
          validation: {
            isValid: true,
            isMigration: context.isMigration
          },
          validationDurationMs: Date.now() - startTime
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Validation stage');
      this.recordMetrics(startTime, false);
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          validation: {
            isValid: false,
            isMigration: context.isMigration
          },
          errorType: err.name,
          errorMessage: err.message
        }
      };
    }
  }

  /**
   * Validate tweet content
   */
  private validateTweetContent(context: TweetContext): { valid: boolean; reason?: string } {
    const { tweet } = context;

    // Check for empty content
    if (!tweet.text.trim()) {
      return { valid: false, reason: 'Tweet has no content' };
    }

    // Check for quoted tweet if it's a quote
    if (tweet.quotedTweet === undefined && tweet.text.includes('RT @')) {
      return { valid: false, reason: 'Retweet without proper quote data' };
    }

    // Check for valid media attachments
    if (tweet.media?.length) {
      const invalidMedia = tweet.media.some(m => !m.url || !m.type);
      if (invalidMedia) {
        return { valid: false, reason: 'Invalid media attachment data' };
      }
    }

    return { valid: true };
  }

  /**
   * Validate engagement metrics
   */
  private validateEngagementMetrics(
    context: TweetContext,
    config: SearchQueryConfig
  ): boolean {
    const { tweet } = context;

    if (config.minLikes && tweet.likeCount < config.minLikes) {
      return false;
    }

    if (config.minRetweets && tweet.retweetCount < config.minRetweets) {
      return false;
    }

    if (config.minReplies && tweet.replyCount < config.minReplies) {
      return false;
    }

    return true;
  }

  /**
   * Record validation metrics
   */
  private recordMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.validation.duration', duration);
    this.metrics.increment(`pipeline.validation.${success ? 'success' : 'failure'}`);
  }
}