import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../utils/ErrorHandler.js';
import { EventBus } from './EventBus.js';
import { TweetEvent, ErrorEvent } from './EventTypes.js';
import { Tweet } from '../../types/twitter.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Main event processor for the Twitter notification system
 * This replaces the TweetProcessingPipeline with a more flexible event-based approach
 */
@injectable()
export class EventProcessor {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.EventBus) private eventBus: EventBus
  ) {
    this.logger.info('Event processor initialized');
  }

  /**
   * Process a tweet by publishing it to the event bus
   * This is the entry point for the event-based system
   */
  async processTweet(tweet: Tweet, topicId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create a unique ID for this tweet processing session
      const eventId = uuidv4();
      
      // Publish tweet event to start the processing pipeline
      const tweetEvent: TweetEvent = {
        id: eventId,
        timestamp: new Date(),
        type: 'tweet',
        tweet,
        topicId,
        metadata: {
          receivedAt: new Date().toISOString(),
          source: 'twitter_monitor'
        }
      };
      await this.eventBus.publish(tweetEvent);
      
      // Record metrics
      this.recordMetrics(startTime);
      
      this.logger.debug('Tweet published to event bus', {
        tweetId: tweet.id,
        topicId,
        eventId
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Tweet processing');
      
      // Publish error event
      const errorEvent: ErrorEvent = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        type: 'error',
        error: err,
        source: 'event_processor',
        context: {
          tweetId: tweet?.id,
          topicId
        }
      };
      await this.eventBus.publish(errorEvent);
    }
  }

  /**
   * Record metrics for tweet processing
   */
  private recordMetrics(startTime: number): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('event_processor.duration', duration);
    this.metrics.increment('event_processor.tweets_processed');
  }
}