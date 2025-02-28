import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { EnhancedMessageFormatter } from '../../../telegram/bot/messageFormatter.js';
import { TweetFormatter, TweetMessageConfig } from '../../../types/telegram.js';
import { EventBus } from '../EventBus.js';
import { FilteredTweetEvent, FormattedTweetEvent, TwitterEvent, ErrorEvent } from '../EventTypes.js';

/**
 * Handler for formatting tweets for delivery
 * This replaces the FormatStage in the pipeline
 */
@injectable()
export class FormatterHandler {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TweetFormatter) private formatter: TweetFormatter,
    @inject(TYPES.EventBus) private eventBus: EventBus
  ) {
    // Subscribe to filtered tweet events
    this.eventBus.subscribe(this.handleFilteredEvent.bind(this), {
      eventType: 'filtered_tweet',
      priority: 20, // Run after eligibility handler
      id: 'formatter_handler'
    });
  }

  /**
   * Handle filtered tweet events
   */
  private handleFilteredEvent(event: TwitterEvent): Promise<void> {
    if (event.type !== 'filtered_tweet' || !('tweet' in event)) return Promise.resolve();
    
    const filteredEvent = event as FilteredTweetEvent;
    
    // Only process tweets that matched filters
    if (!filteredEvent.matched) {
      this.logger.debug(`Tweet ${filteredEvent.tweet.id} did not match filters, skipping formatting`);
      return Promise.resolve();
    }
    
    return this.handleEvent(filteredEvent);
  }

  /**
   * Format the tweet for delivery
   */
  async handleEvent(event: FilteredTweetEvent): Promise<void> {
    const startTime = Date.now();
    this.logger.debug('Starting tweet formatting', {
      tweetId: event.tweet.id,
      topicId: event.topicId
    });

    try {
      // Create message config
      const config: TweetMessageConfig = {
        tweet: event.tweet,
        showSummarizeButton: true
      };
      
      const formattedMessage = this.formatter.formatMessage(config);
      
      // Create formatted event
      const formattedEvent: FormattedTweetEvent = {
        id: `formatted_${event.id}`,
        timestamp: new Date(),
        type: 'formatted_tweet',
        tweet: event.tweet,
        topicId: event.topicId,
        metadata: {
          ...event.metadata,
          format: {
            formatDurationMs: Date.now() - startTime
          }
        },
        isValid: event.isValid,
        validationReason: event.validationReason,
        matched: event.matched,
        rules: event.rules,
        formattedMessage,
        messageButtons: [] // Optional buttons could be added here
      };
      
      // Publish formatted event
      await this.eventBus.publish(formattedEvent);
      
      // Record metrics
      this.recordMetrics(startTime, true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Tweet formatting');
      this.recordMetrics(startTime, false);
      
      // Publish error event
      const errorEvent: ErrorEvent = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        type: 'error',
        error: err,
        source: 'formatter_handler',
        context: {
          tweetId: event.tweet?.id,
          topicId: event.topicId
        }
      };
      await this.eventBus.publish(errorEvent);
    }
  }

  /**
   * Record metrics for formatting
   */
  private recordMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('formatting.duration', duration);
    this.metrics.increment(`formatting.${success ? 'success' : 'failure'}`);
  }
}