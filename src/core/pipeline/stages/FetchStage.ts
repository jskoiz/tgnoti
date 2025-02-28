import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { SearchStrategy } from '../../twitter/searchStrategy.js';
import { SearchConfig } from '../../../config/searchConfig.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { Tweet } from '../../../types/twitter.js';

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
    this.logger.debug('Starting fetch stage', {
      topicId: context.topicId,
      tweetId: context.tweet.id
    });

    try {
      // Get search window
      const { startDate, endDate } = await this.searchConfig.createSearchWindow();
      
      // Validate tweet is within search window
      const tweetDate = new Date(context.tweet.createdAt);
      if (!this.isWithinSearchWindow(tweetDate, startDate, endDate)) {
        return {
          success: false,
          data: context,
          error: new Error('Tweet is outside search window'),
          metadata: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            tweetDate: tweetDate.toISOString()
          }
        };
      }

      // Check if we already have complete tweet data
      if (this.hasCompleteData(context.tweet)) {
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
          }
        };
      }

      // Fetch additional tweet data
      const tweets = await this.searchStrategy.search({
        username: context.tweet.tweetBy.userName,
        startDate: new Date(context.tweet.createdAt),
        endDate: new Date(context.tweet.createdAt),
        excludeRetweets: true,
        excludeQuotes: false,
        language: 'en'
      });
      
      const enrichedTweet = tweets.find((t: Tweet) => t.id === context.tweet.id);
      
      if (!enrichedTweet) {
        return {
          success: false,
          data: context,
          error: new Error('Failed to fetch tweet details'),
          metadata: {
            tweetId: context.tweet.id
          }
        };
      }

      // Update context with enriched tweet data
      const updatedContext: TweetContext = {
        ...context,
        tweet: enrichedTweet,
        metadata: {
          ...context.metadata,
          fetch: {
            fetchDurationMs: Date.now() - startTime,
            skippedFetch: false,
            searchWindow: {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString()
            }
          }
        }
      };

      this.recordMetrics(startTime);

      return {
        success: true,
        data: updatedContext,
        metadata: {
          fetch: {
            fetchDurationMs: Date.now() - startTime,
            skippedFetch: false,
            searchWindow: undefined
          }
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Fetch stage');
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          fetch: {
            fetchDurationMs: Date.now() - startTime,
            skippedFetch: false,
            searchWindow: undefined
          }
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
   * Record metrics for the fetch stage
   */
  private recordMetrics(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.fetch.duration', duration);
    this.metrics.increment('pipeline.fetch.completed');
  }
}