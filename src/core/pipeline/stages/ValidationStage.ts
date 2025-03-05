import { injectable, inject } from 'inversify';
import { Logger, LogContext, LogLevel, LogAggregator } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { Storage } from '../../storage/storage.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { RettiwtErrorHandler } from '../../twitter/RettiwtErrorHandler.js';
import { SearchQueryConfig } from '../../../types/twitter.js';
import { LoggingConfig } from '../../../config/loggingConfig.js';

@injectable()
export class ValidationStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'validation';
  private validationAggregator: LogAggregator = {
    count: 0,
    lastLog: 0,
    window: 5000 // 5 second window for validation aggregation
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.RettiwtErrorHandler) private errorHandler: RettiwtErrorHandler,
    @inject(TYPES.LoggingConfig) private loggingConfig: LoggingConfig
  ) {
    this.logger.setComponent('ValidationStage');
    this.validationAggregator.window = this.loggingConfig.getAggregationWindow('ValidationStage');
  }

  private createLogContext(context: TweetContext, additionalContext: Record<string, any> = {}): LogContext {
    return {
      component: 'ValidationStage',
      tweetId: context.tweet?.id || 'unknown',
      topicId: context.topicId || 'unknown',
      validationStatus: {
        status: context.metadata?.validation?.status || 'pending',
        isValid: context.metadata?.validation?.isValid || false,
        reason: additionalContext.reason || 'none',
        duration: additionalContext.duration
      },
      ...additionalContext
    };
  }

  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();

    const initialContext = this.createLogContext(context, {
      phase: 'start',
      tweetData: {
        text: context.tweet?.text?.substring(0, 50) + '...',
        id: context.tweet?.id
      }
    });
    this.logger.debug('Starting validation', initialContext);

    const updatedContext: TweetContext = {
      ...context,
      validated: false,
      metadata: {
        ...context.metadata,
        validation: { status: 'pending', isValid: false }
      }
    };

    try {
      // Validate tweet content
      const contentValidation = this.validateTweetContent(updatedContext);
      if (!contentValidation.valid) {
        const logContext = this.createLogContext(context, {
          status: 'failed',
          phase: 'content',
          reason: contentValidation.reason,
          validationType: 'content'
        });

        this.logger.debug('Content validation failed', logContext);
        this.metrics.increment('pipeline.validation.content.failure');

        return {
          success: false,
          data: updatedContext,
          error: new Error(contentValidation.reason),
          metadata: {
            reason: 'content_validation',
            status: 'failed',
            validation: { isValid: false },
            details: contentValidation.reason
          }
        };
      }

      // Validate engagement metrics if configured
      const config = await this.storage.getConfig();
      const searchConfig = config.twitter.searchQueries[context.topicId] as SearchQueryConfig;
      
      if (!this.validateEngagementMetrics(updatedContext, searchConfig)) {
        const logContext = this.createLogContext(context, {
          status: 'failed',
          phase: 'engagement',
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
        });

        this.logger.debug('Engagement validation failed', logContext);
        this.metrics.increment('pipeline.validation.engagement.failure');

        return {
          success: false,
          data: updatedContext,
          error: new Error('Tweet does not meet engagement criteria'),
          metadata: {
            reason: 'engagement_metrics',
            status: 'failed',
            validation: { isValid: false },
            metrics: logContext.metrics,
            required: logContext.required
          }
        };
      }

      // Store complete tweet data in MongoDB
      const storageStartTime = Date.now();
      try {
        await this.storage.storeTweet(context.tweet, context.topicId);
        this.metrics.increment('pipeline.validation.storage.success');
        this.metrics.timing('pipeline.validation.storage.duration', Date.now() - storageStartTime);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Failed to store tweet data', error instanceof Error ? error : new Error(String(error)), {
          tweetId: context.tweet.id,
          topicId: context.topicId,
          phase: 'storage',
          error: errorMessage
        });
        this.metrics.increment('pipeline.validation.storage.error');
        updatedContext.metadata.validation = {
          ...updatedContext.metadata.validation,
          isValid: true,  // Keep validation status since storage error doesn't invalidate the tweet
          status: 'success',
          storage: { storedInMongoDB: false, storageError: errorMessage, storageDurationMs: Date.now() - storageStartTime },
          details: { storageError: errorMessage }
        };
        // Continue pipeline even if storage fails
      }

      // Mark tweet as validated in context
      const validatedContext: TweetContext = {
        ...updatedContext,
        validated: true,
        metadata: {
          ...updatedContext.metadata,
          validation: {
            isValid: true,
            status: 'success',
            storage: {
              storedInMongoDB: true,
              storageDurationMs: Date.now() - storageStartTime
            }
          }
        }
      };

      this.metrics.increment('pipeline.validation.success');
      this.metrics.timing('pipeline.validation.duration', Date.now() - startTime);

      const successContext = this.createLogContext(context, {
        status: 'success',
        phase: 'complete',
        duration: Date.now() - startTime
      });

      if (this.logger.shouldLog(LogLevel.DEBUG, this.validationAggregator)) {
        this.logger.debug('Validation successful', successContext);
        this.logger.updateAggregator(this.validationAggregator);
      }

      return {
        success: true,
        data: validatedContext,
        metadata: {
          validation: {
            isValid: true,
            status: 'success'
          },
          validationDurationMs: Date.now() - startTime
        }
      };

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const errorContext = this.createLogContext(context, {
        status: 'error',
        phase: 'error',
        error: err.message,
        stack: err.stack,
        duration: Date.now() - startTime
      });

      this.logger.error('Validation failed', err, errorContext);
      this.metrics.increment('pipeline.validation.error');
      this.metrics.timing('pipeline.validation.duration', Date.now() - startTime);
      
      return {
        success: false,
        data: updatedContext,
        error: err,
        metadata: {
          validation: {
            isValid: false,
            status: 'error'
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
    if (!tweet?.text?.trim()) {
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

    if (config?.minLikes && (tweet?.likeCount || 0) < config.minLikes) {
      return false;
    }

    if (config?.minRetweets && (tweet?.retweetCount || 0) < config.minRetweets) {
      return false;
    }

    if (config?.minReplies && (tweet?.replyCount || 0) < config.minReplies) {
      return false;
    }

    return true;
  }
}