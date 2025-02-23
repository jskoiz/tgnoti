import { MonitoringType } from './topics.js';

/**
 * Interface for tweet filtering strategy
 */
export interface FilterStrategy {
  type: MonitoringType;
  matches: (tweet: any, filters: { mentions: string[]; accounts: string[] }) => boolean;
}

/**
 * Strategy for filtering tweets by mentions
 */
export const mentionFilterStrategy: FilterStrategy = {
  type: MonitoringType.Mention,
  matches: (tweet: any, filters: { mentions: string[] }) => {
    if (!filters.mentions.length) return false;
    
    const tweetText = tweet.text.toLowerCase();
    return filters.mentions.some(mention => 
      tweetText.includes(mention.toLowerCase())
    );
  }
};

/**
 * Strategy for filtering tweets by account
 */
export const accountFilterStrategy: FilterStrategy = {
  type: MonitoringType.Account,
  matches: (tweet: any, filters: { accounts: string[] }) => {
    if (!filters.accounts.length) return false;
    
    const authorUsername = tweet.author.username.toLowerCase();
    return filters.accounts.some(account => 
      authorUsername === account.toLowerCase().replace('@', '')
    );
  }
};

/**
 * Get filter strategy based on monitoring type
 */
export function getFilterStrategy(type: MonitoringType): FilterStrategy {
  switch (type) {
    case MonitoringType.Mention:
      return mentionFilterStrategy;
    case MonitoringType.Account:
      return accountFilterStrategy;
    default:
      throw new Error(`Unknown monitoring type: ${type}`);
  }
}

/**
 * Helper to check if a tweet matches a topic's filters
 */
export function matchesTopic(tweet: any, topic: { type: MonitoringType; filters: { mentions: string[]; accounts: string[] } }): boolean {
  const strategy = getFilterStrategy(topic.type);
  return strategy.matches(tweet, topic.filters);
}