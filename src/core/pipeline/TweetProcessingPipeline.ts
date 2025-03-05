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
    const stageTimings: Record<string, number> = {};

    this.logger.info(`[PIPELINE START:${context.tweet.id}] Tweet ${context.tweet.id} (@${context.tweet.tweetBy?.userName || 'unknown'})`, {
      status: 'PIPELINE_START',
      tweetId: context.tweet.id,
      topicId: context.topicId,
      username: context.tweet.tweetBy?.userName || 'unknown',
      ageInMinutes: Math.round((Date.now() - new Date(context.tweet.createdAt).getTime()) / (60 * 1000)), 
      tweetCount: context.metadata?.batchSize || 1,
      tweetText: context.tweet.text?.substring(0, 50) + (context.tweet.text?.length > 50 ? '...' : '')
    });
    

    let currentContext = { ...context };
    
    let success = true;
    let error: Error | undefined;

    try {
      for (const stage of this.stages) {
        const stageStartTime = Date.now();
        const stageName = stage.name;

        // Log stage start at INFO level
        this.logger.info(`[STAGE START] ${stageName} for tweet ${context.tweet.id}`, {
          status: 'STAGE_START',
          stage: stageName,
          tweetId: context.tweet.id,
          topicId: context.topicId,
          tweetCount: context.metadata?.batchSize || 1
        });
        
        try {
          const result = await this.executeStageWithRetry(stage, currentContext);
          stageResults[stage.name] = result;
          
          // Log stage completion
          if (result.success) {
            const metadata = result.metadata as StageMetadata | undefined;
            const stageDuration = Date.now() - stageStartTime;
            stageTimings[stageName] = stageDuration;
            
            const statusSymbol = result.metadata?.skipped ? '⏩' : '✓';
            this.logger.info(`[${statusSymbol}] Stage ${stageName} completed in ${stageDuration}ms`, {
              tweetId: context.tweet.id,
              success: true,
              stageData: metadata,
              status: 'STAGE_SUCCESS',
              stage: stageName,
              durationMs: stageDuration,
              skipped: result.metadata?.skipped || false,
              tweetCount: context.metadata?.batchSize || 1
            });
          } else {
            const stageDuration = Date.now() - stageStartTime;
            stageTimings[stageName] = stageDuration;
            
            this.logger.info(`[✗] Stage ${stageName} failed in ${stageDuration}ms: ${result.error?.message || 'Unknown error'}`, { 
              tweetId: context.tweet.id, 
              success: false, 
              error: result.error?.message,
              status: 'STAGE_FAILURE',
              stage: stageName,
              durationMs: stageDuration,
              tweetCount: context.metadata?.batchSize || 1
            });
          }


          // Handle skipped cases (e.g., already processed tweets)
          if (result.success && result.metadata?.skipped) {
            this.logger.debug(`[⏩] ${stageName}: ${result.metadata.message || 'Skipped processing'}`);
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
          const stageDuration = Date.now() - stageStartTime;
          stageTimings[stageName] = stageDuration;
          
          // Only log non-rate-limit errors in detail
          if (!err.message?.includes('TOO_MANY_REQUESTS') && !err.message?.includes('Rate limit')) {
            this.logger.info(`[✗] Error in stage ${stageName} (${stageDuration}ms): ${err.message}`, {
              tweetId: context.tweet.id,
              topicId: context.topicId,
              status: 'STAGE_ERROR',
              stage: stageName,
              durationMs: stageDuration,
              errorType: err.name,
              errorMessage: err.message,
              tweetCount: context.metadata?.batchSize || 1
            });
          }
          success = false;
          error = err;
          break;
        } finally {
          const stageDuration = Date.now() - stageStartTime;
          this.metrics.timing(`pipeline.stage.${stageName}.duration`, stageDuration);
        }
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // Only log non-rate-limit errors in detail
      if (!err.message?.includes('TOO_MANY_REQUESTS') && !err.message?.includes('Rate limit')) {
        this.logger.info(`[✗] Pipeline execution failed: ${err.message}`, {
          tweetId: context.tweet.id,
          topicId: context.topicId,
          status: 'PIPELINE_FAILURE',
          username: context.tweet.tweetBy?.userName || 'unknown',
          durationMs: Date.now() - startTime,
          errorType: err.name,
          errorMessage: err.message,
          tweetCount: context.metadata?.batchSize || 1
        });
      }
      success = false;
      error = err;
    }

    const processingTimeMs = Date.now() - startTime;
    this.recordMetrics(success, processingTimeMs);

    // Create a visual representation of the pipeline stages
    const stageVisual = this.createStageVisual(stageResults);
    
    const result: PipelineResult = {
      success,
      context: currentContext,
      error,
      processingTimeMs,
      stageResults
    };

    // Calculate average stage duration
    const stageNames = Object.keys(stageTimings);
    const avgStageDuration = stageNames.length > 0 
      ? Math.round(Object.values(stageTimings).reduce((sum, time) => sum + time, 0) / stageNames.length) 
      : 0;
    
    const statusSymbol = success ? '✓' : '✗';
    this.logger.info(`[PIPELINE ${statusSymbol}:${context.tweet.id}] ${stageVisual} (${processingTimeMs}ms, avg stage: ${avgStageDuration}ms)`, {
      status: success ? 'PIPELINE_COMPLETE' : 'PIPELINE_FAILED',
      tweetId: context.tweet.id,
      topicId: context.topicId,
      username: context.tweet.tweetBy?.userName || 'unknown',
      ageInMinutes: Math.round((Date.now() - new Date(context.tweet.createdAt).getTime()) / (60 * 1000)),
      tweetCount: context.metadata?.batchSize || 1,
      result: {
        success,
        processingTimeMs
      },
      stages: Object.fromEntries(
        Object.entries(stageResults).map(([name, result]) => [
          name,
          { 
            success: result.success, 
            durationMs: stageTimings[name] || 0,
            ...(result.metadata || {}) 
          }
        ])
      )
    });

    return result;
  }
  
  /**
   * Create a visual representation of pipeline stages
   */
  private createStageVisual(stageResults: Record<string, StageResult<unknown>>): string {
    const stages = ['fetch', 'duplicate_check', 'age_validation', 'validation', 'filter', 'format', 'send'];
    const stageSymbols: Record<string, {symbol: string, success: boolean}> = {};
    
    for (const [stageName, result] of Object.entries(stageResults)) {
      if (!result) {
        stageSymbols[stageName] = {symbol: '?', success: false};
      } else if (result.success) {
        stageSymbols[stageName] = {
          symbol: result.metadata?.skipped ? '⏩' : '✓',
          success: true
        };
      } else {
        stageSymbols[stageName] = {symbol: '✗', success: false};
      }
    }
    
    // Find the failed stage if any
    const failedStageIndex = stages.findIndex(stage => 
      stageSymbols[stage] && !stageSymbols[stage].success);
    
    const symbols = stages.map((stage, index) => {
      const stageInfo = stageSymbols[stage] || {symbol: '-', success: false};
      return (index === failedStageIndex) ? `${stageInfo.symbol}:${stage}` : stageInfo.symbol;
    });
    
    return symbols.join(' → ');
  }

  /**
   * Execute a single stage with retry logic
   */
  private async executeStageWithRetry(
    stage: PipelineStage<TweetContext, TweetContext>,
    context: TweetContext
  ): Promise<StageResult<TweetContext>> {
    let lastError: Error | undefined;
    
    // Check if retries are disabled for this stage/context
    const retryCount = context.metadata?.retryCount !== undefined 
      ? context.metadata.retryCount 
      : this.config.retryCount;

    // Handle validation and filter stages without retries
    if (stage.name === 'validation' || stage.name === 'age_validation' || 
        stage.name === 'duplicate_check' || stage.name === 'fetch' || 
        stage.name === 'filter') {
      const stageName = stage.name;
      const result = await stage.execute(context);
      
      // Don't retry if tweet is outside window or validation failed
      if (stage.name === 'duplicate_check') {
        // Set duplicate check status based on result
        const checkResult = result.success ? 'passed' : 'skipped';
        result.metadata = {
          ...result.metadata,
          duplicate_check: checkResult
        };
        
        // Log duplicate check result
        const statusSymbol = result.success ? '✓' : '⏩';
        this.logger.info(`[${statusSymbol}] Duplicate check ${checkResult}`, {
          status: `DUPLICATE_CHECK_${checkResult.toUpperCase()}`,
          tweetId: context.tweet.id, 
          topicId: context.topicId,
          username: context.tweet?.tweetBy?.userName || 'unknown',
          ageInMinutes: Math.round((Date.now() - new Date(context.tweet?.createdAt || new Date()).getTime()) / (60 * 1000)),
          checkResult: result.success ? 'passed' : 'skipped',
          reason: result.metadata?.reason
        });
      }
      
      // Return result without retrying
      return result; // Return immediately for validation stages
    }

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
            this.logger.info(`[✓] Stage ${stage.name} succeeded after ${attempt} attempts`, {
              status: 'STAGE_RETRY_SUCCESS',
              stage: stage.name,
              tweetId: context.tweet.id,
              attempts: attempt
            });
          }
          return result;
        }

        const errorMessage = result.error?.message || 'Unknown error';
        this.logger.info(`[RETRY ${attempt}/${retryCount}] Stage ${stage.name} failed: ${errorMessage}`, 
          {
            status: 'STAGE_RETRY_FAILURE',
            stage: stage.name,
            tweetId: context.tweet.id,
            attempt,
            retryCount,
            error: errorMessage
          }
        );
        lastError = result.error || new Error(errorMessage);
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.logger.info(`[RETRY ${attempt}/${retryCount}] Stage ${stage.name} error: ${lastError.message}`,
          {
            status: 'STAGE_RETRY_ERROR',
            stage: stage.name,
            tweetId: context.tweet.id,
            attempt,
            retryCount,
            error: lastError.message
          }
        );
      }

      if (attempt < retryCount) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    return {
      success: false,
      data: context,
      error: lastError || new Error(`Stage ${stage.name} failed after ${retryCount} attempts`)
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
