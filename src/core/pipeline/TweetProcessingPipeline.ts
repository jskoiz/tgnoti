import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { MetricsManager } from '../../utils/MetricsManager.js';
import { TYPES } from '../../types/di.js';
import {
  PipelineStage,
  TweetContext,
  PipelineConfig,
  PipelineResult,
  StageResult
} from './types/PipelineTypes.js';

@injectable()
export class TweetProcessingPipeline {
  private stages: PipelineStage<TweetContext, TweetContext>[] = [];
  private config: PipelineConfig;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    config?: Partial<PipelineConfig>
  ) {
    this.config = {
      enableValidation: true,
      enableFiltering: true,
      enableFormatting: true,
      retryCount: 3,
      isMigration: false,
      timeoutMs: 30000,
      ...config
    };
  }

  /**
   * Add a processing stage to the pipeline
   */
  addStage(stage: PipelineStage<TweetContext, TweetContext>): void {
    this.stages.push(stage);
    this.logger.debug(`Added pipeline stage: ${stage.name}`);
  }

  /**
   * Process a tweet through all stages
   */
  async process(context: TweetContext): Promise<PipelineResult> {
    const startTime = Date.now();
    const stageResults: Record<string, StageResult<unknown>> = {};

    this.logger.debug('Starting tweet processing pipeline', {
      tweetId: context.tweet.id,
      topicId: context.topicId
    });

    let currentContext = { ...context };
    
    // Update config if context is in migration mode
    if (context.isMigration) {
      this.config.isMigration = true;
    }
    
    let success = true;
    let error: Error | undefined;

    try {
      for (const stage of this.stages) {
        const stageStartTime = Date.now();
        
        try {
          const result = await this.executeStageWithRetry(stage, currentContext);
          stageResults[stage.name] = result;

          if (!result.success) {
            success = false;
            error = result.error;
            break;
          }

          currentContext = result.data;
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          this.logger.error(`Error in pipeline stage ${stage.name}`, {
            error: err,
            tweetId: context.tweet.id,
            topicId: context.topicId
          });
          success = false;
          error = err;
          break;
        } finally {
          const stageDuration = Date.now() - stageStartTime;
          this.metrics.timing(`pipeline.stage.${stage.name}.duration`, stageDuration);
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.logger.error('Pipeline execution failed', {
        error: err,
        tweetId: context.tweet.id,
        topicId: context.topicId
      });
      success = false;
      error = err;
    }

    const processingTimeMs = Date.now() - startTime;
    this.recordMetrics(success, processingTimeMs);

    const result: PipelineResult = {
      success,
      context: currentContext,
      error,
      processingTimeMs,
      stageResults
    };

    this.logger.debug('Pipeline execution completed', {
      tweetId: context.tweet.id,
      topicId: context.topicId,
      success,
      processingTimeMs
    });

    return result;
  }

  /**
   * Execute a single stage with retry logic
   */
  private async executeStageWithRetry(
    stage: PipelineStage<TweetContext, TweetContext>,
    context: TweetContext
  ): Promise<StageResult<TweetContext>> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
      try {
        const result = await Promise.race([
          stage.execute(context),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Stage ${stage.name} timed out after ${this.config.timeoutMs}ms`));
            }, this.config.timeoutMs);
          })
        ]);

        if (result.success) {
          if (attempt > 1) {
            this.logger.info(`Stage ${stage.name} succeeded after ${attempt} attempts`);
          }
          return result;
        }

        lastError = result.error;
        this.logger.warn(`Stage ${stage.name} failed attempt ${attempt}/${this.config.retryCount}`, {
          error: lastError
        });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(`Stage ${stage.name} failed attempt ${attempt}/${this.config.retryCount}`, {
          error: lastError
        });
      }

      if (attempt < this.config.retryCount) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return {
      success: false,
      data: context,
      error: lastError || new Error(`Stage ${stage.name} failed after ${this.config.retryCount} attempts`)
    };
  }

  /**
   * Record pipeline metrics
   */
  private recordMetrics(success: boolean, duration: number): void {
    this.metrics.timing('pipeline.total_duration', duration);
    this.metrics.increment(`pipeline.result.${success ? 'success' : 'failure'}`);
    this.metrics.gauge('pipeline.stages_count', this.stages.length);
  }
}