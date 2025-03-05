import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { Tweet } from '../types/twitter.js';
import { Environment } from '../config/environment.js';
import { TweetProcessingPipeline } from './pipeline/TweetProcessingPipeline.js';
import { MetricsManager } from './monitoring/MetricsManager.js';
import { MONITORING_ACCOUNTS } from '../config/monitoring.js';
import { SearchConfig } from '../config/searchConfig.js';
import { getTopicById } from '../config/topicConfig.js';
import { Storage } from './storage/storage.js';

interface ProcessResult {
  success: boolean;
  channelName: string;
  redirectReason?: 'competitor_tweet' | 'competitor_mention';
  mentionedCompetitors?: string[];
  ageInMinutes: number;
  failureStage?: string;
}

@injectable()
export class TweetProcessor {
  private searchWindowCache: Map<string, number> = new Map();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.TweetProcessingPipeline) private pipeline: TweetProcessingPipeline,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig,
    @inject(TYPES.Storage) private storage: Storage
  ) {
    this.logger.setComponent('TweetProcessor');
  }

  /**
   * Process a batch of tweets for a topic
   */
  async processTweetBatch(tweets: Tweet[], topicId: string): Promise<void> {
    const startTime = Date.now();
    const batchResults = {
      // Group tweets by their processing outcome
      groupedResults: {
        ageValidationFailures: new Map<number, Tweet[]>(), // Map of age -> tweets
        duplicates: [] as Tweet[],
        successfulTweets: [] as Tweet[],
        redirectedTweets: [] as Tweet[],
        otherFailures: new Map<string, Tweet[]>() // Map of reason -> tweets
      },
      processed: 0,
      successful: 0,
      failed: 0,
      failureReasons: {
        ageValidation: 0,
        fetch: 0,
        duplicate: 0,
        other: 0
      }
    };

    // Find monitoring account for this topic
    const monitoringAccount = MONITORING_ACCOUNTS.find(a => a.topicId.toString() === topicId);
    const [topicName] = monitoringAccount ? (getTopicById(monitoringAccount.topicId) || []) : [];
    const channelName = topicName || 'UNKNOWN_MONITORING';
    
    this.logger.info(`[BATCH START:${topicId}] Processing ${tweets.length} tweets for ${channelName}`, {
      topicId,
      channelName,
      tweetCount: tweets.length,
      oldestTweet: tweets[tweets.length - 1]?.createdAt,
      newestTweet: tweets[0]?.createdAt
    });

    // Sort tweets by creation date, newest first
    tweets.sort((a: Tweet, b: Tweet) => {
      const dateA = new Date(a.createdAt);
      const dateB = new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });

    // Enable summarized logging for batches with more than this many tweets
    const SUMMARIZE_THRESHOLD = 5;
    const useSummarizedLogging = tweets.length > SUMMARIZE_THRESHOLD;
    // Track tweets by age for better summary
    const tweetsByAge: Record<string, number> = {};

    for (const tweet of tweets) {
      try {
        // Pre-check for duplicates before processing to avoid race conditions
        const isDuplicate = await this.storage.hasSeen(tweet.id, topicId);
        if (isDuplicate) {
          // Skip logging for duplicates to reduce verbosity
          batchResults.processed++;
          batchResults.groupedResults.duplicates.push(tweet);
          batchResults.failureReasons.duplicate++;
          continue;
        }
        
        // Log tweet data before processing to understand what we're working with
        this.logger.debug(`[PIPELINE START] Tweet (@${tweet.tweetBy?.userName})`, {
        });
        
        const result = await this.processSingleTweet(tweet, topicId, tweets.length);
        batchResults.processed++; 
        
        // Track tweet age for summary
        const ageCategory = this.getAgeCategory(result.ageInMinutes);
        if (!tweetsByAge[ageCategory]) {
          tweetsByAge[ageCategory] = 0;
        }
        tweetsByAge[ageCategory]++;

        if (result.success) {
          batchResults.successful++;
          
          const redirected = result.redirectReason !== undefined;
          // Check if this was a redirected tweet
          if (result.redirectReason) {
            this.logger.info(
              `[✓] Tweet (@${tweet.tweetBy.userName}): Redirected ${result.redirectReason === 'competitor_tweet' ? 'FROM' : 'MENTION'} competitor`, {
              }
            );
            batchResults.groupedResults.redirectedTweets.push(tweet);
          } else {
            // Log successful processing at INFO level
            this.logger.info(
              `[✓] Tweet (@${tweet.tweetBy.userName}): Successfully processed`, {
                tweetText: tweet.text?.substring(0, 50) + (tweet.text?.length > 50 ? '...' : '')
              }
            );
            batchResults.groupedResults.successfulTweets.push(tweet);
          }
        } else {
          batchResults.failed++;
          
          // Determine failure reason from metadata
          if (result.failureStage === 'age_validation') {
            batchResults.failureReasons.ageValidation++;
            // Group by age
            const age = result.ageInMinutes;
            if (!batchResults.groupedResults.ageValidationFailures.has(age)) {
              batchResults.groupedResults.ageValidationFailures.set(age, []);
            }
            batchResults.groupedResults.ageValidationFailures.get(age)?.push(tweet);
          } else if (result.failureStage === 'fetch') {
            batchResults.failureReasons.fetch++;
            // Group by other failure reason
            if (!batchResults.groupedResults.otherFailures.has('fetch')) {
              batchResults.groupedResults.otherFailures.set('fetch', []);
            }
            batchResults.groupedResults.otherFailures.get('fetch')?.push(tweet);
          } else {
            batchResults.failureReasons.other++;
          }
        }

      } catch (error: unknown) {
        batchResults.failed++;
        batchResults.failureReasons.other++;
        const err = error instanceof Error ? error : new Error(String(error));
        
        // Group by error message
        if (!batchResults.groupedResults.otherFailures.has(err.message)) {
          batchResults.groupedResults.otherFailures.set(err.message, []);
        }
        batchResults.groupedResults.otherFailures.get(err.message)?.push(tweet);
        this.logger.info(`[✗] Tweet (@${tweet.tweetBy?.userName || 'unknown'}): Processing error: ${err.message}`, {
        });
      }
    }

    // Log summarized results if we have many tweets
    if (useSummarizedLogging) {
      // Log age validation failures in a summarized way
      if (batchResults.groupedResults.ageValidationFailures.size > 0) {
        const totalAgeFailures = batchResults.failureReasons.ageValidation;
        const ageGroups = Array.from(batchResults.groupedResults.ageValidationFailures.entries())
          .sort((a, b) => a[0] - b[0]); // Sort by age
        
        // Create a summary of age failures
        const ageSummary = ageGroups.map(([age, tweets]) => 
          `${tweets.length} tweets at ${age}m`).join(', ');
        
        // Simplified summary without detailed age breakdown
        this.logger.info(`[SUMMARY] ${totalAgeFailures} tweets failed due to age`, {});
      }
      
      // Log successful tweets summary
      if (batchResults.groupedResults.successfulTweets.length > 0) {
        const successCount = batchResults.groupedResults.successfulTweets.length;
        this.logger.info(`[SUCCESS SUMMARY] ${successCount} tweets successfully processed and sent to Telegram`, {
          status: 'SUCCESS_SUMMARY',
          topicId,
          channelName,
          successCount
        });
      }
      
      // Log redirected tweets summary
      if (batchResults.groupedResults.redirectedTweets.length > 0) {
        const redirectCount = batchResults.groupedResults.redirectedTweets.length;
        this.logger.info(`[REDIRECT SUMMARY] ${redirectCount} tweets redirected to competitor channels`, {
          status: 'REDIRECT_SUMMARY',
          topicId,
          channelName,
          redirectCount
        });
      }
    }

    // Log batch summary
    // Calculate success rate
    const successRate = batchResults.processed > 0 ? 
      Math.round((batchResults.successful / batchResults.processed) * 100) : 0;
    
    // Format time window
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (this.searchConfig.getSearchWindowMinutes() * 60 * 1000));
    const formatTime = (date: Date) => date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    
    // Create progress bar
    const progressBar = this.createProgressBar(batchResults.successful, batchResults.processed);
    
    this.logger.info(`[BATCH SUMMARY] ${channelName}: ${batchResults.successful}/${batchResults.processed} tweets processed successfully (${successRate}%)`);
    
    // Add age distribution summary
    // Add age distribution summary
    if (Object.keys(tweetsByAge).length > 0) {
      const ageDistribution = Object.entries(tweetsByAge)
        .sort(([a], [b]) => {
          // Sort by age category (0-30m, 30-60m, etc.)
          const getMinutes = (category: string) => parseInt(category.split('-')[0]);
          return getMinutes(a) - getMinutes(b);
        })
        .map(([category, count]) => `${category}: ${count}`)
        .join(', ');
      
      this.logger.info(`[AGE DISTRIBUTION] ${ageDistribution}`);
    }
    
    // Add actionable hints if needed
    if (batchResults.failureReasons.ageValidation > 0) {
      const oldestTweetAge = tweets.length > 0 ? 
        Math.round((Date.now() - new Date(tweets[tweets.length - 1].createdAt).getTime()) / (60 * 1000)) : 0;
      
      this.logger.info(`[HINT] To process older tweets, increase SEARCH_WINDOW_MINUTES=${Math.ceil(oldestTweetAge * 1.1)}`);
    }
    
    // Add configuration context
    this.logger.info(`[CONFIG] Search window: ${this.searchConfig.getSearchWindowMinutes()} minutes (${formatTime(startDate)} - ${formatTime(endDate)})`);

    // End batch log section
    this.logger.info(`[BATCH END]`, {
      topicId,
      duration: Date.now() - startTime
    });

    // Mark the window as processed
    this.searchConfig.markWindowProcessed(topicId);
  }

  /**
   * Create a visual progress bar for batch results
   */
  private createProgressBar(successful: number, total: number): string {
    if (total === 0) return '[----------]';
    
    const barLength = 10;
    const successfulCount = Math.round((successful / total) * barLength);
    const failedCount = barLength - successfulCount;
    
    return '[' + '✓'.repeat(successfulCount) + '✗'.repeat(failedCount) + ']';
  }

  /**
   * Process a single tweet using either the pipeline or event system
   */
  private async processSingleTweet(tweet: Tweet, topicId: string, batchSize: number = 1): Promise<ProcessResult> {
    const startTime = Date.now();

    try {
      // Find monitoring account for this topic
      const monitoringAccount = MONITORING_ACCOUNTS.find(a => a.topicId.toString() === topicId);
      const [topicName] = monitoringAccount ? (getTopicById(monitoringAccount.topicId) || []) : [];
      const channelName = topicName || 'UNKNOWN_MONITORING';

      // Skip detailed pipeline start logging to reduce verbosity
      
      const pipelineResult = await this.pipeline.process({
        tweet,
        topicId,
        processed: false,
        validated: false,
        filtered: false,
        formatted: false,
        sent: false,
        metadata: {
          source: 'twitter_monitor', 
          batchSize, // Set from the batch size
          processingStartTime: startTime,
          retryCount: 0
        }
      });

      // Extract metadata from stage results
      const stageResults = pipelineResult.stageResults || {};
      const success = pipelineResult.success && !pipelineResult.context.metadata?.skipped;

      // Determine which stage failed
      let failureStage = 'unknown';
      if (!success) {
        for (const stageName of ['fetch', 'duplicate_check', 'age_validation', 'validation', 'filter', 'format', 'send']) {
          if (stageResults[stageName] && !stageResults[stageName].success) {
            failureStage = stageName;
            break;
          }
        }
      }
      
      // Log the pipeline result at INFO level
      const ageInMinutes = Math.round((Date.now() - new Date(tweet.createdAt).getTime()) / (60 * 1000));
      const statusSymbol = success ? '✓' : '✗';
      const statusText = success ? 'SUCCESS' : `FAILED at ${failureStage}`;
      
      this.logger.info(`[${statusSymbol}] Tweet (@${tweet.tweetBy.userName}): ${statusText}`, {
      });

      this.metrics.increment(`tweet_processor.pipeline.${success ? 'success' : 'failure'}`);
      this.metrics.timing('tweet_processor.single_tweet.duration', Date.now() - startTime);
      
      // Format tweet details
      // Create pipeline stages visualization

      // Include redirect information in the result if present
      return {
        success,
        channelName,
        redirectReason: pipelineResult.context.metadata.redirectReason,
        mentionedCompetitors: pipelineResult.context.metadata.mentionedCompetitors,
        ageInMinutes,
        failureStage
      };

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      // Only log detailed error info for non-rate-limit errors
      if (!err.message?.includes('TOO_MANY_REQUESTS') && !err.message?.includes('Rate limit')) {
        this.logger.info(`[✗] Tweet (@${tweet.tweetBy?.userName || 'unknown'}): Pipeline error: ${err.message}`, {
        });
      }

      this.metrics.increment('tweet_processor.pipeline.error');
      throw err;
    }
  }

  /**
   * Helper method to check data completeness
   */
  private getDataCompleteness(tweet: Tweet): string {
    const fields = [
      tweet.id ? 'id' : null,
      tweet.text ? 'text' : null,
      tweet.createdAt ? 'createdAt' : null,
      tweet.tweetBy?.userName ? 'userName' : null,
      tweet.replyCount !== undefined ? 'replyCount' : null,
      tweet.retweetCount !== undefined ? 'retweetCount' : null,
      tweet.likeCount !== undefined ? 'likeCount' : null
    ].filter(Boolean);
    
    return `${fields.length}/7 fields: ${fields.join(', ')}`;
  }

  /**
   * Categorize tweet age for summary reporting
   */
  private getAgeCategory(ageInMinutes: number): string {
    if (ageInMinutes <= 30) {
      return '0-30m';
    } else if (ageInMinutes <= 60) {
      return '30-60m';
    } else if (ageInMinutes <= 180) {
      return '1-3h';
    } else if (ageInMinutes <= 360) {
      return '3-6h';
    } else if (ageInMinutes <= 720) {
      return '6-12h';
    }
    return '12h+';
  }
}