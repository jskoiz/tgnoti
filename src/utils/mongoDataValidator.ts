import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { TweetDocument, TopicFilterDocument } from '../types/mongodb.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';

/**
 * Utility class for validating MongoDB data integrity
 */
@injectable()
export class MongoDataValidator {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('MongoDataValidator');
  }

  /**
   * Validates a tweet document before saving to MongoDB
   * @param tweet The tweet document to validate
   * @returns An object containing validation result and any error messages
   */
  validateTweet(tweet: TweetDocument): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const startTime = Date.now();
    
    // Check required fields
    if (!tweet.id) {
      errors.push('Missing required field: id');
    }
    if (!tweet.text) {
      errors.push('Missing required field: text');
    }
    if (!tweet.tweetBy) {
      errors.push('Missing required field: tweetBy');
    }

    // Check tweetBy object
    if (tweet.tweetBy) {
      if (!tweet.tweetBy.userName) {
        errors.push('Missing required tweetBy field: userName');
      }
      if (!tweet.tweetBy.displayName) {
        errors.push('Missing required tweetBy field: displayName');
      }
      if (!tweet.tweetBy.fullName) {
        errors.push('Missing required tweetBy field: fullName');
      }
    }

    // Check metadata
    if (!tweet.metadata) {
      errors.push('Missing metadata object');
    } else {
      if (!tweet.metadata.topicId) {
        errors.push('Missing topicId in metadata');
      }
      if (!tweet.metadata.capturedAt) {
        errors.push('Missing capturedAt in metadata');
      }
    }

    // Check processing status
    if (!tweet.processingStatus) {
      errors.push('Missing processingStatus object');
    }

    // Validate data types
    if (tweet.id && typeof tweet.id !== 'string') {
      errors.push('Tweet ID must be a string');
    }
    if (tweet.text && typeof tweet.text !== 'string') {
      errors.push('Tweet text must be a string');
    }
    if (tweet.metadata?.topicId && typeof tweet.metadata.topicId !== 'string') {
      errors.push('Topic ID must be a string');
    }

    // Record validation metrics
    this.metrics.timing('mongodb.validation.tweet_duration', Date.now() - startTime);
    if (errors.length > 0) {
      this.metrics.increment('mongodb.validation.tweet_failures');
    } else {
      this.metrics.increment('mongodb.validation.tweet_successes');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates a topic filter document before saving to MongoDB
   * @param filter The topic filter document to validate
   * @returns An object containing validation result and any error messages
   */
  validateTopicFilter(filter: TopicFilterDocument): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const startTime = Date.now();

    // Check required fields
    if (!filter.topicId) {
      errors.push('Missing required field: topicId');
    }
    if (!filter.filterType) {
      errors.push('Missing required field: filterType');
    }
    if (!filter.value) {
      errors.push('Missing required field: value');
    }

    // Validate filter type
    const validFilterTypes = ['user', 'mention', 'keyword'];
    if (filter.filterType && !validFilterTypes.includes(filter.filterType)) {
      errors.push(`Invalid filter type: ${filter.filterType}. Must be one of: ${validFilterTypes.join(', ')}`);
    }

    // Validate data types
    if (filter.topicId && typeof filter.topicId !== 'number') {
      errors.push('Topic ID must be a number');
    }
    if (filter.filterType && typeof filter.filterType !== 'string') {
      errors.push('Filter type must be a string');
    }
    if (filter.value && typeof filter.value !== 'string') {
      errors.push('Filter value must be a string');
    }

    // Record validation metrics
    this.metrics.timing('mongodb.validation.filter_duration', Date.now() - startTime);
    if (errors.length > 0) {
      this.metrics.increment('mongodb.validation.filter_failures');
    } else {
      this.metrics.increment('mongodb.validation.filter_successes');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates monitor state data before saving to MongoDB
   * @param state The monitor state data to validate
   * @returns An object containing validation result and any error messages
   */
  validateMonitorState(state: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const startTime = Date.now();

    // Check required fields
    if (!state.lastPollTimes) {
      errors.push('Missing required field: lastPollTimes');
    }
    if (state.circuitBreakerStates && typeof state.circuitBreakerStates !== 'object') {
      errors.push('circuitBreakerStates must be an object');
    }

    // Validate data types
    if (state.lastPollTimes && typeof state.lastPollTimes !== 'object') {
      errors.push('lastPollTimes must be an object mapping topic IDs to timestamps');
    }
    
    // Check that lastPollTimes values are valid date strings
    if (state.lastPollTimes && typeof state.lastPollTimes === 'object') {
      for (const [topicId, timestamp] of Object.entries(state.lastPollTimes)) {
        if (typeof timestamp !== 'string' || isNaN(Date.parse(timestamp as string))) {
          errors.push(`Invalid timestamp for topic ${topicId}: ${timestamp}`);
        }
      }
    }

    // Record validation metrics
    this.metrics.timing('mongodb.validation.state_duration', Date.now() - startTime);
    if (errors.length > 0) {
      this.metrics.increment('mongodb.validation.state_failures');
    } else {
      this.metrics.increment('mongodb.validation.state_successes');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates metrics snapshot data before saving to MongoDB
   * @param snapshot The metrics snapshot data to validate
   * @returns An object containing validation result and any error messages
   */
  validateMetricsSnapshot(snapshot: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const startTime = Date.now();

    // Check required fields
    if (!snapshot.timestamp) {
      errors.push('Missing required field: timestamp');
    }
    if (!snapshot.metrics) {
      errors.push('Missing required field: metrics');
    }

    // Validate data types
    if (snapshot.timestamp && typeof snapshot.timestamp !== 'number') {
      errors.push('timestamp must be a number');
    }
    if (snapshot.metrics && typeof snapshot.metrics !== 'object') {
      errors.push('metrics must be an object');
    }

    // Record validation metrics
    this.metrics.timing('mongodb.validation.metrics_duration', Date.now() - startTime);
    if (errors.length > 0) {
      this.metrics.increment('mongodb.validation.metrics_failures');
    } else {
      this.metrics.increment('mongodb.validation.metrics_successes');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Performs data integrity checks on the MongoDB collections
   * @param db The MongoDB database instance
   * @param collections Object containing collection names
   * @returns An object containing check results and any issues found
   */
  async checkDataIntegrity(db: any, collections: any): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];
    const startTime = Date.now();

    try {
      // Check tweets collection
      const tweetsCollection = db.collection(collections.tweets);
      
      // Check for tweets without required fields
      const invalidTweets = await tweetsCollection.countDocuments({
        $or: [
          { id: { $exists: false } },
          { text: { $exists: false } },
          { tweetBy: { $exists: false } },
          { 'metadata.topicId': { $exists: false } }
        ]
      });
      
      if (invalidTweets > 0) {
        issues.push(`Found ${invalidTweets} tweets with missing required fields`);
      }
      
      // Check for duplicate tweet IDs
      const duplicateTweetsPipeline = [
        { $group: { _id: '$id', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
      ];
      
      const duplicateTweets = await tweetsCollection.aggregate(duplicateTweetsPipeline).toArray();
      if (duplicateTweets.length > 0) {
        issues.push(`Found ${duplicateTweets.length} duplicate tweet IDs`);
      }
      
      // Check topic filters collection
      const topicFiltersCollection = db.collection(collections.topicFilters);
      
      // Check for filters without required fields
      const invalidFilters = await topicFiltersCollection.countDocuments({
        $or: [
          { topicId: { $exists: false } },
          { filterType: { $exists: false } },
          { value: { $exists: false } }
        ]
      });
      
      if (invalidFilters > 0) {
        issues.push(`Found ${invalidFilters} topic filters with missing required fields`);
      }
      
      // Check for invalid filter types
      const invalidFilterTypes = await topicFiltersCollection.countDocuments({
        filterType: { $nin: ['user', 'mention', 'keyword'] }
      });
      
      if (invalidFilterTypes > 0) {
        issues.push(`Found ${invalidFilterTypes} topic filters with invalid filter types`);
      }
      
      // Record integrity check metrics
      this.metrics.timing('mongodb.integrity_check.duration', Date.now() - startTime);
      if (issues.length > 0) {
        this.metrics.increment('mongodb.integrity_check.failures');
      } else {
        this.metrics.increment('mongodb.integrity_check.successes');
      }
      
      return {
        isValid: issues.length === 0,
        issues
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error during data integrity check:', err);
      this.metrics.increment('mongodb.integrity_check.errors');
      
      issues.push(`Error during integrity check: ${err.message}`);
      return {
        isValid: false,
        issues
      };
    }
  }
}