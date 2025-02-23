import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { Storage } from '../storage/storage.js';
import { RettiwtSearchBuilder } from '../twitter/rettiwtSearchBuilder.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { SearchQueryConfig, Tweet } from '../types/twitter.js';
import { DateValidator, DateValidationError } from '../utils/dateValidation.js';
import { EnhancedMessageFormatter } from '../bot/messageFormatter.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { TYPES } from '../types/di.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { SearchConfig } from '../config/searchConfig.js';
import { SearchStrategy } from '../twitter/searchStrategy.js';
import { getTopicName } from '../config/topicConfig.js';

interface ProcessingResult {
  totalFound: number;
  totalProcessed: number;
  totalSent: number;
  totalErrors: number;
  processingTimeMs: number;
}

@injectable()
export class TweetProcessor {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.TelegramBot) private telegram: TelegramBot,
    @inject(TYPES.TwitterClient) private twitter: TwitterClient,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.RettiwtSearchBuilder) private searchBuilder: RettiwtSearchBuilder,
    @inject(TYPES.TweetFormatter) private tweetFormatter: EnhancedMessageFormatter,
    @inject(TYPES.DateValidator) private dateValidator: DateValidator,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig,
    @inject(TYPES.SearchStrategy) private searchStrategy: SearchStrategy
  ) {}

  /**
   * Process new tweets for all configured topics
   */
  async processNewTweets(): Promise<ProcessingResult> {
    const startTime = Date.now();
    const result: ProcessingResult = {
      totalFound: 0,
      totalProcessed: 0,
      totalSent: 0,
      totalErrors: 0,
      processingTimeMs: 0
    };

    try {
      const config = await this.storage.getConfig();
      this.logger.debug('Starting tweet processing cycle');
      this.metrics.increment('tweet.processing.cycles');

      this.logger.debug('Creating search window...');
      const { startDate, endDate } = await this.createSearchWindow();
      this.logger.debug('Search window created', { startDate, endDate });

      this.logger.debug('Validating search window...');
      await this.dateValidator.validateSearchWindow(startDate, endDate);
      this.logger.debug('Search window validated', { startDate, endDate });
      this.metrics.increment('date.validation.success');

      // Process each topic's tweets
      for (const [topicId, searchConfig] of Object.entries(config.twitter.searchQueries as Record<string, SearchQueryConfig>)) {
        try {
          this.logger.debug(`Processing topic: ${this.getTopicName(topicId)}`, {
            topicId,
            searchConfig: {
              type: searchConfig.type,
              accounts: searchConfig.accounts,
              keywords: searchConfig.keywords
            }
          });

          this.logger.debug('About to process topic tweets...', { topicId, searchConfig });
          const topicResult = await this.processTopicTweets(topicId, searchConfig, startDate, endDate);
          result.totalFound += topicResult.found;
          result.totalProcessed += topicResult.processed;
          result.totalSent += topicResult.sent;
          result.totalErrors += topicResult.errors;

          this.logger.debug(`Completed topic: ${this.getTopicName(topicId)}`, {
            topicId,
            found: topicResult.found,
            processed: topicResult.processed,
            sent: topicResult.sent,
            errors: topicResult.errors
          });
        } catch (error) {
          this.errorHandler.handleError(error, `Topic ${this.getTopicName(topicId)}`);
          result.totalErrors++;
          continue;
        }
      }

      // Cleanup old records periodically
      await this.storage.cleanup();

      result.processingTimeMs = Date.now() - startTime;
      this.recordMetrics(result);

      this.logger.info('Tweet processing cycle completed', {
        totalFound: result.totalFound,
        totalProcessed: result.totalProcessed,
        totalSent: result.totalSent,
        totalErrors: result.totalErrors,
        duration: result.processingTimeMs
      });

      return result;
    } catch (error) {
      this.errorHandler.handleError(error, 'Tweet processing');
      result.totalErrors++;
      result.processingTimeMs = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Process tweets for a single topic
   */
  private async processTopicTweets(
    topicId: string,
    searchConfig: SearchQueryConfig,
    startDate: Date,
    endDate: Date
  ): Promise<{ found: number; processed: number; sent: number; errors: number }> {
    const result = { found: 0, processed: 0, sent: 0, errors: 0 };

    // Validate search config
    if (!this.validateSearchConfig(searchConfig)) {
      return result;
    }

    try {
      // Use SearchStrategy for enhanced search
      const tweets = await this.searchStrategy.search({
        username: searchConfig.accounts?.[0] || '', 
        startDate,
        endDate,
        excludeRetweets: searchConfig.excludeRetweets,
        excludeQuotes: searchConfig.excludeQuotes,
        language: searchConfig.language || 'en',
        operator: searchConfig.operator
      });

      if (!tweets.length) {
        this.logger.debug(`No tweets found for ${this.getTopicName(topicId)}`, {
          topicId,
          dateRange: `${startDate.toISOString()} to ${endDate.toISOString()}`
        });
        return result;
      }

      result.found = tweets.length;

      this.logger.debug(`Processing ${tweets.length} tweets for ${this.getTopicName(topicId)}`, {
        topicId,
        tweetIds: tweets.slice(0, 5).map(t => t.id) // Log first 5 tweet IDs
      });

      // Process each tweet
      for (const tweet of tweets) {
        try {
          const processed = await this.processSingleTweet(tweet, topicId);
          if (processed.sent) result.sent++;
          if (processed.error) result.errors++;
          result.processed++;
        } catch (error) {
          this.errorHandler.handleError(error, `Tweet ${tweet.id}`);
          result.errors++;
        }
      }

      // Update last tweet ID if any tweets were found
      if (tweets.length > 0) {
        await this.storage.updateLastTweetId(topicId, tweets[0].id);
      }

    } catch (error) {
      this.errorHandler.handleError(error, `Search for ${this.getTopicName(topicId)}`);
      result.errors++;
    }

    return result;
  }

  /**
   * Process a single tweet
   */
  private async processSingleTweet(tweet: Tweet, topicId: string): Promise<{ sent: boolean; error: boolean }> {
    const result = { sent: false, error: false };
    const startTime = Date.now();

    try {
      // Validate tweet date
      if (!(await this.dateValidator.validateTweetDate(tweet)) && !(tweet.quotedTweet && await this.dateValidator.validateTweetDate(tweet.quotedTweet))) {
        this.logger.warn(
          `Skipping tweet ${tweet.id} from ${tweet.createdAt} for ${this.getTopicName(topicId)} - ` +
          'tweet date is outside the allowed search window'
        );
        return result;
      }

      // Check if tweet or its quoted tweet was already seen
      const tweetSeen = await this.storage.hasSeen(tweet.id, topicId);
      if (tweetSeen || (tweet.quotedTweet && await this.storage.hasSeen(tweet.quotedTweet.id, topicId))) {
        return result;
      }

      // Send tweet to Telegram
      this.logger.debug(`Sending tweet ${tweet.id} for ${this.getTopicName(topicId)}`);
      const sent = await this.sendFormattedTweet(tweet, topicId);

      if (sent) {
        await this.storage.markSeen(tweet.id, topicId);
        result.sent = true;
        this.logger.debug(`Successfully sent and marked tweet ${tweet.id} as seen for ${this.getTopicName(topicId)}`);
      } else {
        result.error = true;
        this.logger.warn(`Failed to send tweet ${tweet.id} for ${this.getTopicName(topicId)}`);
      }
    } catch (error) {
      result.error = true;
      this.errorHandler.handleError(error, `Tweet ${tweet.id}`);
    }

    // Record processing time
    const processingTime = Date.now() - startTime;
    this.metrics.timing(`tweet.processing_time.${topicId}`, processingTime);

    return result;
  }

  /**
   * Create a time window for searching tweets
   */
  private async createSearchWindow(): Promise<{ startDate: Date; endDate: Date }> {
    const endDate = new Date();
    return await this.searchConfig.createSearchWindow();
  }

  /**
   * Validate the search window dates
   */
  private async validateSearchWindow(startDate: Date, endDate: Date): Promise<void> {
    try {
      this.dateValidator.validateSearchWindow(startDate, endDate);
    } catch (error) {
      if (error instanceof DateValidationError) {
        this.errorHandler.handleError(error, 'Search window validation');
        throw error;
      }
      throw error;
    }
  }

  /**
   * Validate search configuration
   */
  private validateSearchConfig(searchConfig: SearchQueryConfig): boolean {
    if (!searchConfig.type || searchConfig.type !== 'structured') {
      this.logger.error('Invalid search config type');
      return false;
    }

    if (!searchConfig.keywords?.length && !searchConfig.accounts?.length && !searchConfig.mentions?.length) {
      this.logger.error('No search criteria provided');
      return false;
    }

    return true;
  }

  /**
   * Send formatted tweet to Telegram
   */
  private async sendFormattedTweet(tweet: Tweet, topicId: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      const config = {
        tweet,
        quotedTweet: tweet.quotedTweet || undefined,
        showSummarizeButton: tweet.text.length > 280
      };

      await this.telegram.sendTweet(tweet, topicId);
      
      const sendTime = Date.now() - startTime;
      this.metrics.timing('telegram.send_time', sendTime);
      this.metrics.increment('telegram.messages.sent');
      
      return true;
    } catch (error) {
      this.errorHandler.handleError(error, `Send tweet ${tweet.id}`);
      this.metrics.increment('telegram.messages.failed');
      return false;
    }
  }

  /**
   * Record processing metrics
   */
  private recordMetrics(result: ProcessingResult): void {
    this.metrics.gauge('tweet.processing.total_found', result.totalFound);
    this.metrics.gauge('tweet.processing.total_processed', result.totalProcessed);
    this.metrics.gauge('tweet.processing.total_sent', result.totalSent);
    this.metrics.gauge('tweet.processing.total_errors', result.totalErrors);
    this.metrics.timing('tweet.processing.total_time', result.processingTimeMs);
  }

  /**
   * Get human-readable topic name
   */
  private getTopicName(topicId: string): string {
    return getTopicName(topicId);
  }
}