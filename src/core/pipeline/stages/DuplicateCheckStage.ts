import { injectable, inject } from 'inversify';
import { Logger, LogContext, LogLevel, LogAggregator } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { Storage } from '../../storage/storage.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { MONITORING_ACCOUNTS } from '../../../config/monitoring.js';

@injectable()
export class DuplicateCheckStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'duplicate_check';
  private validationAggregator: LogAggregator = {
    count: 0,
    lastLog: 0,
    window: 5000 // 5 second window for validation aggregation
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('DuplicateCheckStage');
  }

  private createLogContext(context: TweetContext, additionalContext: Record<string, any> = {}): LogContext {
    return {
      component: 'DuplicateCheckStage',
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

    // Find monitoring account for this topic
    const monitoringAccount = MONITORING_ACCOUNTS.find(a => a.topicId.toString() === context.topicId);
    const channelName = monitoringAccount ? `${monitoringAccount.account.toUpperCase().replace('WITH', '')}_MONITORING` : 'UNKNOWN';

    try {
      if (!context.tweet?.id || !context.topicId) {
        throw new Error('Missing required tweet data');
      }

      const seen = await this.storage.hasSeen(context.tweet.id, context.topicId);
      
      // Enhanced logging for duplicate detection
      const ageInMinutes = Math.round((Date.now() - new Date(context.tweet.createdAt).getTime()) / (60 * 1000));
      this.logger.debug(`Duplicate check: ${seen ? 'DUPLICATE' : 'UNIQUE'} tweet ${context.tweet.id}`, {
        isDuplicate: seen
      });
      
      const reason = seen ? `Tweet ${context.tweet.id} already processed for topic ${context.topicId}` : 'No duplicate found';

      if (seen) {
        const skippedContext: TweetContext = {
          ...context,
          metadata: {
            ...context.metadata,
            validation: {
              isValid: false,
              status: 'skipped' as const,
              reason: 'duplicate',
              details: { duplicateType: 'storage' }
            },
            skipped: true
          }
        };

        this.logger.debug('Duplicate tweet found - skipping processing', {
        });

        this.metrics.increment('pipeline.duplicate_check.skipped');
        this.metrics.timing('pipeline.duplicate_check.duration', Date.now() - startTime);

        return {
          success: true,
          data: skippedContext,
          metadata: {
            reason,
            tweetId: context.tweet.id,
            channelName,
            details: {
              duplicateType: 'storage',
              checkDurationMs: Date.now() - startTime
            }
          }
        };
      }

      const validatedContext: TweetContext = {
        ...context,
        metadata: {
          ...context.metadata,
          validation: {
            isValid: true,
            status: 'success' as const,
            reason: 'unique',
            details: { duplicateType: 'none' }
          }
        }
      };

      this.metrics.increment('pipeline.duplicate_check.success');
      this.metrics.timing('pipeline.duplicate_check.duration', Date.now() - startTime);
      
      this.logger.debug('Unique tweet - proceeding with processing', {
      });

      return {
        success: true,
        data: validatedContext,
        metadata: {
          reason,
          tweetId: context.tweet.id,
          channelName,
          details: {
            duplicateType: 'none',
            checkDurationMs: Date.now() - startTime
          }
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      const errorContext = this.createLogContext(context, {
        status: 'error',
        phase: 'error',
        error: err.message,
        stack: err.stack,
        duration: Date.now() - startTime
      });

      const ageInMinutes = Math.round((Date.now() - new Date(context.tweet?.createdAt || new Date()).getTime()) / (60 * 1000));
      this.logger.error(`Duplicate check failed: ${err.message}`, err, {
      });
      this.metrics.increment('pipeline.duplicate_check.error');
      this.metrics.timing('pipeline.duplicate_check.duration', Date.now() - startTime);

      const erroredContext: TweetContext = {
        ...context,
        metadata: {
          ...context.metadata,
          validation: {
            isValid: false,
            status: 'error' as const,
            reason: err.message,
            details: { errorType: err.name }
          }
        }
      };

      return {
        success: false,
        data: erroredContext,
        error: err,
        metadata: {
          validation: {
            isValid: false,
            status: 'error' as const,
            reason: err.message,
            details: { errorType: err.name }
          },
          errorType: err.name,
          errorMessage: err.message,
          channelName,
          tweetId: context.tweet?.id || 'unknown'
        }
      };
    }
  }
}