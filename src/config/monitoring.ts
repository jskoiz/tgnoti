import { RetryPolicy } from './environment.js';
import { TOPIC_CONFIG } from './topicConfig.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenTimeout: number;
}

export interface MonitoringAccount {
  topicId: number;
  account: string;
}

/**
 * Generate monitoring accounts from topic configuration
 * This eliminates duplication by deriving accounts from the single source of truth in topicConfig.ts
 */
export const MONITORING_ACCOUNTS: MonitoringAccount[] = Object.entries(TOPIC_CONFIG).flatMap(([topicName, details]) => {
  // Extract user filters from the topic
  const userFilters = details.filters.filter(filter => filter.type === 'user');
  
  // Map each user filter to a MonitoringAccount
  return userFilters.map(filter => ({
    topicId: details.id,
    account: filter.value.toLowerCase()
  }));
});

export interface MonitoringConfig {
  topics: Record<string, any>;
  groupId: string;
  polling: {
    intervalMinutes: number;
    maxResults: number;
    timeWindowHours: number;
    batchSize: number;
    retry: RetryPolicy;
  };
  fields: {
    tweet: string[];
    expansions: string[];
    media: string[];
    user: string[];
  };
}
