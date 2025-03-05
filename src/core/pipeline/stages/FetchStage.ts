import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { SearchStrategy } from '../../twitter/searchStrategy.js';
import { SearchConfig } from '../../../config/searchConfig.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { Tweet } from '../../../types/twitter.js';
import { MONITORING_ACCOUNTS } from '../../../config/monitoring.js';
import { getTopicById } from '../../../config/topicConfig.js';

@injectable()
export class FetchStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'fetch';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.SearchStrategy) private searchStrategy: SearchStrategy,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler
  ) {}

  /**
   * Execute the fetch stage
   */
  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();
    
    // SIMPLIFIED APPROACH with improved logging
    const tweetAge = Math.round((Date.now() - new Date(context.tweet.createdAt).getTime()) / (60 * 1000));
    const hasMinimumData = this.hasMinimumRequiredData(context.tweet);
    const hasCompleteData = this.hasCompleteData(context.tweet);
    
    this.logger.debug(`[FETCH] Tweet (@${context.tweet.tweetBy?.userName || 'unknown'}): Using original data`, {
      dataStatus: hasCompleteData ? 'COMPLETE' : (hasMinimumData ? 'MINIMUM' : 'INSUFFICIENT')
    });
    
    // Check if we have enough data in the original tweet to proceed
    if (hasMinimumData) {
      this.recordMetrics(startTime);
      
      return {
        success: true,
        data: {
          ...context,
          metadata: {
            ...context.metadata,
            fetch: {
              fetchDurationMs: Date.now() - startTime,
              skippedFetch: true,
              searchWindow: undefined
            }
          }
        },
        metadata: {
          fetch: {
            fetchDurationMs: Date.now() - startTime,
            skippedFetch: true,
            searchWindow: undefined
          }
        }
      };
    } else {
      const missingFields = this.getMissingFields(context.tweet);
      this.logger.error(`[✗] Tweet (@${context.tweet.tweetBy?.userName || 'unknown'}): Insufficient data. Missing: ${missingFields.join(', ')}`);
      
      return {
        success: false,
        data: context,
        error: new Error(`Tweet has insufficient data: missing ${this.getMissingFields(context.tweet).join(', ')}`),
        metadata: {
          tweetId: context.tweet.id
        }
      };
    }
  }

  /**
   * Check if tweet is within the search window
   */
  private isWithinSearchWindow(tweetDate: Date, startDate: Date, endDate: Date): boolean {
    return tweetDate >= startDate && tweetDate <= endDate;
  }
  
  /**
   * Check if we have all required tweet data
   */
  private hasCompleteData(tweet: Tweet): boolean {
    return Boolean(
      tweet.id &&
      tweet.text &&
      tweet.createdAt &&
      tweet.tweetBy?.userName &&
      tweet.replyCount !== undefined &&
      tweet.retweetCount !== undefined &&
      tweet.likeCount !== undefined
    );
  }
  
  /**
   * Check if we have minimum required tweet data to proceed
   */
  private hasMinimumRequiredData(tweet: Tweet): boolean {
    return Boolean(
      tweet && tweet.id &&
      tweet.text && tweet.text.length > 0 &&
      tweet.createdAt && 
      tweet.tweetBy && tweet.tweetBy.userName
    );
  }

  /**
   * Get list of missing required fields
   */
  private getMissingFields(tweet: Tweet): string[] {
    const missingFields = [];
    
    if (!tweet.id) missingFields.push('id');
    if (!tweet.text || tweet.text.length === 0) missingFields.push('text');
    if (!tweet.createdAt) missingFields.push('createdAt');
    if (!tweet.tweetBy || !tweet.tweetBy.userName) missingFields.push('userName');
    
    return missingFields;
  }

  /**
   * Record metrics for the fetch stage
   */
  private recordMetrics(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.fetch.duration', duration);
    this.metrics.increment('pipeline.fetch.completed');
  }
}