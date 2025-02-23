import { ProcessedTweet, TopicConfig } from '../types/monitoring.js';

/**
 * Type guard for ProcessedTweet
 */
export const isValidProcessedTweet = (tweet: any): tweet is ProcessedTweet => {
  return (
    tweet &&
    typeof tweet.id === 'string' &&
    typeof tweet.text === 'string' &&
    typeof tweet.author_id === 'string' &&
    typeof tweet.created_at === 'string' &&
    (!tweet.user || (
      typeof tweet.user.username === 'string' &&
      typeof tweet.user.id === 'string'
    ))
  );
};

/**
 * Type guard for TopicConfig
 */
export const isValidTopicConfig = (topic: any): topic is TopicConfig => {
  return (
    topic &&
    typeof topic.id === 'number' &&
    typeof topic.name === 'string' &&
    (topic.type === 'mention' || topic.type === 'account') &&
    typeof topic.searchQuery === 'string' &&
    topic.filters &&
    topic.filterOptions &&
    typeof topic.filterOptions === 'object'
  );
};