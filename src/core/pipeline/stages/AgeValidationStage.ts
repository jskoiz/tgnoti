import { injectable, inject } from 'inversify';
import { Logger, LogContext, LogLevel, LogAggregator } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { SearchConfig } from '../../../config/searchConfig.js';

@injectable()
export class AgeValidationStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'age_validation';
  private validationAggregator: LogAggregator = {
    count: 0,
    lastLog: 0,
    window: 5000 // 5 second window for validation aggregation
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig
  ) {
    this.logger.setComponent('AgeValidationStage');
  }

  private createLogContext(context: TweetContext, additionalContext: Record<string, any> = {}): LogContext {
    return {
      component: 'AgeValidationStage',
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
    // Skip detailed start logging to reduce verbosity

    try {
      const { tweet } = context;
      const tweetDate = new Date(tweet.createdAt);
      const now = new Date();
      const ageInMinutes = (now.getTime() - tweetDate.getTime()) / (60 * 1000);
      const maxAge = this.searchConfig.getSearchWindowMinutes();
      const isValid = ageInMinutes <= maxAge;

      const validationReason = isValid 
        ? 'Tweet within age window'
        : `Tweet age (${Math.round(ageInMinutes)} minutes) exceeds maximum allowed age (${maxAge} minutes)`;

      // Add detailed logging for age validation
      const searchEndTime = new Date();
      const searchStartTime = new Date(searchEndTime.getTime() - (maxAge * 60 * 1000));
      
      // Format times like "10:20:03 AM"
      const formatTime = (date: Date) => date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      
      // Only log window information for debugging
      this.logger.debug(`[WINDOW] ${formatTime(searchStartTime)} - ${formatTime(searchEndTime)}`);

      if (!isValid) {
        // Only log detailed age validation failures at debug level to avoid duplicate logging
        // The TweetProcessor will log the failure at info level
        if (tweet.tweetBy?.userName) {
          const formattedTweetTime = new Date(tweet.createdAt).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          this.logger.debug(`[✗] Tweet (@${tweet.tweetBy.userName}): Age ${Math.round(ageInMinutes)}m exceeds ${maxAge}m window limit`);
        }
        this.metrics.increment('pipeline.age_validation.failure');

        return {
          success: false,
          data: context,
          error: new Error(validationReason),
          metadata: {
            reason: `Age ${Math.round(ageInMinutes)}m exceeds ${maxAge}m window limit`,
            status: 'failed',
            validation: { 
              isValid: false,
              status: 'failed',
              reason: `Age ${Math.round(ageInMinutes)}m exceeds ${maxAge}m window limit`
            },
            details: {
              ageInMinutes: Math.round(ageInMinutes),
              maxAge
            }
          }
        };
      }

      // Update context with age validation result
      const validatedContext: TweetContext = {
        ...context,
        metadata: {
          ...context.metadata,
          validation: {
            isValid: true,
            status: 'success',
            reason: validationReason
          }
        }
      };

      this.metrics.increment('pipeline.age_validation.success');
      this.metrics.timing('pipeline.age_validation.duration', Date.now() - startTime);

      if (this.logger.shouldLog(LogLevel.DEBUG, this.validationAggregator)) {        
      }

      return {
        success: true,
        data: validatedContext,
        metadata: {
          validation: {
            isValid: true,
            status: 'success',
            reason: validationReason
          },
          details: {
            ageInMinutes: Math.round(ageInMinutes),
            maxAge
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

      this.logger.error('Age validation failed', err, errorContext);
      this.metrics.increment('pipeline.age_validation.error');
      this.metrics.timing('pipeline.age_validation.duration', Date.now() - startTime);
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          validation: {
            isValid: false,
            status: 'error',
            reason: err.message
          },
          errorType: err.name,
          errorMessage: err.message
        }
      };
    }
  }
}