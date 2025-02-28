import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { TopicFilterManager } from '../../../telegram/bot/TopicFilterManager.js';
import { UsernameHandler } from '../../../utils/usernameHandler.js';
import { EventBus } from '../EventBus.js';
import { TweetEvent, ValidatedTweetEvent, FilteredTweetEvent, TwitterEvent, ErrorEvent } from '../EventTypes.js';
import { Storage } from '../../storage/storage.js';

/**
 * Consolidated handler for tweet eligibility (validation + filtering)
 * This replaces the separate ValidationStage and FilterStage
 */
@injectable()
export class EligibilityHandler {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TopicFilterManager) private filterManager: TopicFilterManager,
    @inject(TYPES.UsernameHandler) private usernameHandler: UsernameHandler,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.EventBus) private eventBus: EventBus
  ) {
    // Subscribe to tweet events
    this.eventBus.subscribe(this.handleTweetEvent.bind(this), {
      eventType: 'tweet',
      priority: 10,
      id: 'eligibility_handler'
    });
  }

  // Handler for tweet events that matches the EventHandler type
  private handleTweetEvent(event: TwitterEvent): Promise<void> {
    return event.type === 'tweet' && 'tweet' in event ? this.handleEvent(event as TweetEvent) : Promise.resolve();
  }

  /**
   * Handle tweet events
   */
  async handleEvent(event: TweetEvent): Promise<void> {
    if (event.type !== 'tweet') return;

    const startTime = Date.now();
    this.logger.debug('Starting eligibility check', {
      tweetId: event.tweet.id,
      topicId: event.topicId
    });

    try {
      // Step 1: Validate tweet (check if already processed)
      const validationResult = await this.validateTweet(event);
      if (!validationResult.isValid) {
        // Tweet failed validation, publish validation event and stop processing
        await this.eventBus.publish(validationResult);
        return;
      }

      // Step 2: Filter tweet (check if it matches criteria)
      const filterResult = await this.filterTweet(validationResult);
      
      // Publish filter result (whether successful or not)
      await this.eventBus.publish(filterResult);

      // Record metrics
      this.recordMetrics(startTime, filterResult.matched);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Eligibility check');
      this.recordMetrics(startTime, false);
      
      // Publish error event
      const errorEvent: ErrorEvent = {
        id: `error_${Date.now()}`,
        timestamp: new Date(),
        type: 'error',
        error: err,
        source: 'eligibility_handler',
        context: {
          tweetId: event.tweet?.id,
          topicId: event.topicId,
        }
      };
      await this.eventBus.publish(errorEvent);
    }
  }

  /**
   * Validate tweet (check if already processed)
   */
  private async validateTweet(event: TweetEvent): Promise<ValidatedTweetEvent> {
    const validationStartTime = Date.now();
    
    try {
      // Check if tweet was already processed
      const isAlreadyProcessed = await this.storage.isTweetProcessed(event.tweet.id);
      
      if (isAlreadyProcessed) {
        this.logger.debug(`Tweet ${event.tweet.id} was already processed`);
        
        return {
          id: `validated_${event.id}`,
          timestamp: new Date(),
          type: 'validated_tweet',
          tweet: event.tweet,
          topicId: event.topicId,
          metadata: {
            ...event.metadata,
            validation: {
              isValid: false,
              status: 'rejected',
              reason: 'already_processed',
              validationDurationMs: Date.now() - validationStartTime
            }
          },
          isValid: false,
          validationReason: 'already_processed'
        };
      }
      
      // Mark tweet as processed
      await this.storage.markTweetAsProcessed(event.tweet.id);
      
      return {
        id: `validated_${event.id}`,
        timestamp: new Date(),
        type: 'validated_tweet',
        tweet: event.tweet,
        topicId: event.topicId,
        metadata: {
          ...event.metadata,
          validation: {
            isValid: true,
            status: 'approved',
            validationDurationMs: Date.now() - validationStartTime
          }
        },
        isValid: true
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Tweet validation failed', err);
      
      return {
        id: `validated_${event.id}`,
        timestamp: new Date(),
        type: 'validated_tweet',
        tweet: event.tweet,
        topicId: event.topicId,
        metadata: {
          ...event.metadata,
          validation: {
            isValid: false,
            status: 'error',
            reason: err.message,
            validationDurationMs: Date.now() - validationStartTime
          }
        },
        isValid: false,
        validationReason: err.message
      };
    }
  }

  /**
   * Filter tweet (check if it matches criteria)
   */
  private async filterTweet(event: ValidatedTweetEvent): Promise<FilteredTweetEvent> {
    const filterStartTime = Date.now();
    
    try {
      // Get topic-specific filters
      const topicFilters = await this.filterManager.getFilters(Number(event.topicId));
      
      // Require at least one filter to be configured
      if (topicFilters.length === 0) {
        return {
          id: `filtered_${event.id}`,
          timestamp: new Date(),
          type: 'filtered_tweet',
          tweet: event.tweet,
          topicId: event.topicId,
          metadata: {
            ...event.metadata,
            filter: {
              matched: false,
              rules: [],
              reason: 'no_filters',
              filterDurationMs: Date.now() - filterStartTime
            }
          },
          isValid: event.isValid,
          validationReason: event.validationReason,
          matched: false,
          rules: []
        };
      }

      // Get the username filter
      const usernameFilter = topicFilters.find(f => f.type === 'user' || f.type === 'mention');
      if (!usernameFilter) {
        return {
          id: `filtered_${event.id}`,
          timestamp: new Date(),
          type: 'filtered_tweet',
          tweet: event.tweet,
          topicId: event.topicId,
          metadata: {
            ...event.metadata,
            filter: {
              matched: false,
              rules: [],
              reason: 'no_username_filter',
              filterDurationMs: Date.now() - filterStartTime
            }
          },
          isValid: event.isValid,
          validationReason: event.validationReason,
          matched: false,
          rules: []
        };
      }

      // Enhanced logging for username debugging
      const normalizedFilterUsername = this.usernameHandler.normalizeUsername(usernameFilter.value);
      const normalizedTweetUsername = this.usernameHandler.normalizeUsername(event.tweet.tweetBy.userName);
      const normalizedMentions = event.tweet.entities?.mentionedUsers?.map(u => 
        this.usernameHandler.normalizeUsername(u)
      ) || [];

      // Log detailed username information
      this.logger.debug('Username comparison details', {
        tweetId: event.tweet.id,
        filterUsername: {
          original: usernameFilter.value,
          normalized: normalizedFilterUsername
        },
        tweetBy: {
          original: event.tweet.tweetBy.userName,
          normalized: normalizedTweetUsername
        },
        mentions: {
          original: event.tweet.entities?.mentionedUsers || [],
          normalized: normalizedMentions
        },
        tweetText: event.tweet.text
      });
      
      // Check if tweet is relevant to the user
      if (!this.usernameHandler.isTweetRelevantToUser(event.tweet, usernameFilter.value)) {
        return {
          id: `filtered_${event.id}`,
          timestamp: new Date(),
          type: 'filtered_tweet',
          tweet: event.tweet,
          topicId: event.topicId,
          metadata: {
            ...event.metadata,
            filter: {
              matched: false,
              rules: [],
              reason: 'missing_username',
              details: {
                expectedUsername: normalizedFilterUsername,
                tweetUsername: normalizedTweetUsername,
                mentions: normalizedMentions
              },
              filterDurationMs: Date.now() - filterStartTime
            }
          },
          isValid: event.isValid,
          validationReason: event.validationReason,
          matched: false,
          rules: []
        };
      }

      // Tweet passed filtering
      return {
        id: `filtered_${event.id}`,
        timestamp: new Date(),
        type: 'filtered_tweet',
        tweet: event.tweet,
        topicId: event.topicId,
        metadata: {
          ...event.metadata,
          filter: {
            matched: true,
            rules: [`username:${usernameFilter.value}`],
            filterDurationMs: Date.now() - filterStartTime
          }
        },
        isValid: event.isValid,
        validationReason: event.validationReason,
        matched: true,
        rules: [`username:${usernameFilter.value}`]
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Tweet filtering failed', err);
      
      return {
        id: `filtered_${event.id}`,
        timestamp: new Date(),
        type: 'filtered_tweet',
        tweet: event.tweet,
        topicId: event.topicId,
        metadata: {
          ...event.metadata,
          filter: {
            matched: false,
            rules: [],
            reason: 'error',
            filterDurationMs: Date.now() - filterStartTime
          }
        },
        isValid: event.isValid,
        validationReason: event.validationReason,
        matched: false,
        rules: []
      };
    }
  }

  /**
   * Record metrics for eligibility check
   */
  private recordMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('eligibility.duration', duration);
    this.metrics.increment(`eligibility.${success ? 'success' : 'failure'}`);
  }
}