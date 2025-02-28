import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { TYPES } from '../../types/di.js';
import {
  PipelineStage,
  TweetContext,
  PipelineConfig,
  PipelineResult,
  StageResult,
  StageMetadata
} from './types/PipelineTypes.js';

@injectable()
export class TweetProcessingPipeline {
  private stages: PipelineStage<TweetContext, TweetContext>[] = [];

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.PipelineConfig) private config: PipelineConfig
  ) { 
    this.logger.debug('Pipeline initialized with config:', config);
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
    
    let success = true;
    let error: Error | undefined;

    try {
      for (const stage of this.stages) {
        const stageStartTime = Date.now();
        
        try {
          const result = await this.executeStageWithRetry(stage, currentContext);
          stageResults[stage.name] = result;
          
          // Log stage completion
          if (result.success) {
            const metadata = result.metadata as StageMetadata | undefined;
            const validationData = metadata?.validation || {
              isValid: false,
              status: 'pending' as const
            };
            
            this.logger.debug(`Stage ${stage.name} completed`, {
              tweetId: context.tweet.id,
              success: true,
              stageData: stage.name === 'validation' && metadata ? {
                validation: {
                  ...validationData,
                  reason: metadata.reason,
                  details: validationData.details
                },
                validationDurationMs: metadata.validationDurationMs,
                reason: metadata.reason,
                metrics: metadata.filter?.rules
              } : undefined
            });
          } else {
            this.logger.debug(`Stage ${stage.name} failed`, { 
              tweetId: context.tweet.id, success: false, error: result.error?.message });
          }


          // Handle skipped cases (e.g., already processed tweets)
          if (result.success && result.metadata?.skipped) {
            this.logger.info(`${stage.name}: ${result.metadata.message}`);
            success = true;
            break;
          }
          else if (!result.success) {
            success = false;
            error = result.error;
            break;
          }

          currentContext = result.data;
        } catch (e) {
          const err = e instanceof Error ? e : new Error(String(e));
          this.logger.error(`Error in pipeline stage ${stage.name} (tweet: ${context.tweet.id}, topic: ${context.topicId})`, err);
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
      this.logger.error(`Pipeline execution failed (tweet: ${context.tweet.id}, topic: ${context.topicId})`, err);
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
      status: { 
        success, 
        processingTimeMs 
      },
      stages: Object.fromEntries(
        Object.entries(stageResults).map(([name, result]) => [
          name,
          { success: result.success, ...(result.metadata || {}) }
        ])
      )
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
        this.logger.warn(
          `Stage ${stage.name} failed attempt ${attempt}/${this.config.retryCount}`,
          lastError
        );
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(
          `Stage ${stage.name} failed attempt ${attempt}/${this.config.retryCount}`,
          lastError
        );
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
