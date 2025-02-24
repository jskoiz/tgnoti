import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { TweetProcessor } from '../core/TweetProcessor.js';
import { TweetProcessingPipeline } from '../core/pipeline/TweetProcessingPipeline.js';
import { MetricsManager } from './MetricsManager.js';
import { ErrorHandler } from './ErrorHandler.js';
import { Tweet } from '../types/twitter.js';
import { TweetContext } from '../core/pipeline/types/PipelineTypes.js';

@injectable()
export class MigrationManager {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TweetProcessor) private legacyProcessor: TweetProcessor,
    @inject(TYPES.TweetProcessingPipeline) private pipeline: TweetProcessingPipeline,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler
  ) {}

  /**
   * Process tweets using both old and new implementations
   * Compare results and log any differences
   */
  async processTweetsWithValidation(tweets: Tweet[], topicId: string): Promise<void> {
    for (const tweet of tweets) {
      try {
        // Process with legacy implementation
        const legacyStartTime = Date.now();
        const legacyResult = await this.legacyProcessor.processSingleTweet(tweet, topicId);
        const legacyDuration = Date.now() - legacyStartTime;

        // Process with new pipeline
        const pipelineStartTime = Date.now();
        const context: TweetContext = {
          tweet,
          topicId,
          processed: false,
          validated: false,
          filtered: false,
          formatted: false,
          sent: false,
          metadata: {},
          isMigration: true
        };
        const pipelineResult = await this.pipeline.process(context);
        const pipelineDuration = Date.now() - pipelineStartTime;

        // Compare results
        await this.compareResults(legacyResult, pipelineResult, {
          tweetId: tweet.id,
          topicId,
          legacyDuration,
          pipelineDuration
        });

      } catch (error) {
        this.errorHandler.handleError(error, `Migration validation for tweet ${tweet.id}`);
        this.metrics.increment('migration.validation.errors');
      }
    }
  }

  /**
   * Compare results from both implementations
   */
  private async compareResults(
    legacyResult: { sent: boolean; error: boolean },
    pipelineResult: { success: boolean; context: TweetContext },
    metadata: {
      tweetId: string;
      topicId: string;
      legacyDuration: number;
      pipelineDuration: number;
    }
  ): Promise<void> {
    const {
      tweetId,
      topicId,
      legacyDuration,
      pipelineDuration
    } = metadata;

    // Record timing differences
    const timingDiff = pipelineDuration - legacyDuration;
    this.metrics.timing('migration.timing_difference', timingDiff);

    // Compare success/failure states
    const legacySuccess = legacyResult.sent && !legacyResult.error;
    const pipelineSuccess = pipelineResult.success && pipelineResult.context.sent;

    if (legacySuccess !== pipelineSuccess) {
      this.logger.warn('Migration validation: Result mismatch', {
        tweetId,
        topicId,
        legacySuccess,
        pipelineSuccess,
        legacyResult,
        pipelineResult: {
          success: pipelineResult.success,
          sent: pipelineResult.context.sent,
          error: pipelineResult.context.error?.message
        }
      });
      this.metrics.increment('migration.validation.mismatches');
    } else {
      this.logger.debug('Migration validation: Results match', {
        tweetId,
        topicId,
        success: legacySuccess,
        timingDiff
      });
      this.metrics.increment('migration.validation.matches');
    }

    // Record performance metrics
    this.metrics.timing('migration.legacy.duration', legacyDuration);
    this.metrics.timing('migration.pipeline.duration', pipelineDuration);
  }

  /**
   * Enable or disable parallel processing
   */
  async setParallelProcessing(enabled: boolean): Promise<void> {
    this.logger.info(`${enabled ? 'Enabling' : 'Disabling'} parallel processing for migration`);
    // Implementation will be added as needed
  }

  /**
   * Get migration statistics
   */
  async getMigrationStats(): Promise<{
    totalProcessed: number;
    matches: number;
    mismatches: number;
    errors: number;
    averageTimingDiff: number;
  }> {
    // This will be implemented to fetch metrics from MetricsManager
    return {
      totalProcessed: 0,
      matches: 0,
      mismatches: 0,
      errors: 0,
      averageTimingDiff: 0
    };
  }
}