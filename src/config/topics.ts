import { RetryPolicy } from './retry.js';

/**
 * Monitoring type enum
 */
export enum MonitoringType {
  Mention = 'mention',
  Account = 'account'
}

/**
 * Search filter configuration
 */
export interface SearchFilter {
  keywords?: string[];
  accounts?: string[];
  mentions?: string[];
  language?: string;
  excludeRetweets?: boolean;
  excludeReplies?: boolean;
  minLikes?: number;
  minRetweets?: number;
  minReplies?: number;
  // Additional monitoring-specific fields
  excludeQuotes?: boolean;
  excludeUsernames?: string[];
  excludePatterns?: string[];
  searchQuery?: string;
  type?: MonitoringType;
}

/**
 * Topic notification configuration
 */
export interface NotificationConfig {
  enabled: boolean;
  format?: {
    template?: string;
    includeMetrics?: boolean;
    includeLinks?: boolean;
    customFields?: Record<string, string>;
  };
  throttle?: {
    maxPerHour?: number;
    maxPerDay?: number;
  };
}

/**
 * Complete topic configuration
 */
export interface TopicConfig {
  id: number;
  name: string;
  description?: string;
  enabled: boolean;
  filters: SearchFilter[];
  retryPolicy: RetryPolicy;
  notification: NotificationConfig;
  metadata?: Record<string, unknown>;
  // Additional monitoring-specific fields
  type?: MonitoringType;
  groupId?: string;
  searchQuery?: string;
  filterOptions?: Omit<SearchFilter, 'keywords' | 'accounts' | 'mentions' | 'language'>;
}

/**
 * Validate a search filter configuration
 */
export function validateSearchFilter(filter: SearchFilter): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // At least one search criteria must be specified
  if (
    (!filter.keywords || filter.keywords.length === 0) &&
    (!filter.accounts || filter.accounts.length === 0) &&
    (!filter.mentions || filter.mentions.length === 0)
  ) {
    errors.push('At least one search criteria (keywords, accounts, or mentions) must be specified');
  }

  // Validate arrays contain valid strings
  if (filter.keywords && !filter.keywords.every(k => typeof k === 'string' && k.length > 0)) {
    errors.push('All keywords must be non-empty strings');
  }

  if (filter.accounts && !filter.accounts.every(a => typeof a === 'string' && a.length > 0)) {
    errors.push('All accounts must be non-empty strings');
  }

  if (filter.mentions && !filter.mentions.every(m => typeof m === 'string' && m.length > 0)) {
    errors.push('All mentions must be non-empty strings');
  }

  // Validate numeric fields
  if (filter.minLikes !== undefined && (typeof filter.minLikes !== 'number' || filter.minLikes < 0)) {
    errors.push('minLikes must be a non-negative number when specified');
  }

  if (filter.minRetweets !== undefined && (typeof filter.minRetweets !== 'number' || filter.minRetweets < 0)) {
    errors.push('minRetweets must be a non-negative number when specified');
  }

  if (filter.minReplies !== undefined && (typeof filter.minReplies !== 'number' || filter.minReplies < 0)) {
    errors.push('minReplies must be a non-negative number when specified');
  }

  // Validate monitoring-specific fields
  if (filter.type !== undefined && !Object.values(MonitoringType).includes(filter.type)) {
    errors.push('Invalid monitoring type specified');
  }

  if (filter.excludeUsernames && !filter.excludeUsernames.every(u => typeof u === 'string' && u.length > 0)) {
    errors.push('All excluded usernames must be non-empty strings');
  }

  if (filter.excludePatterns && !filter.excludePatterns.every(p => typeof p === 'string' && p.length > 0)) {
    errors.push('All excluded patterns must be non-empty strings');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate a topic configuration
 */
export function validateTopicConfig(topic: TopicConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate required fields
  if (typeof topic.id !== 'number' || topic.id < 0) {
    errors.push('Topic id must be a non-negative number');
  }

  if (typeof topic.name !== 'string' || topic.name.trim().length === 0) {
    errors.push('Topic name must be a non-empty string');
  }

  if (typeof topic.enabled !== 'boolean') {
    errors.push('Topic enabled flag must be a boolean');
  }

  // Validate filters
  if (!Array.isArray(topic.filters) || topic.filters.length === 0) {
    errors.push('Topic must have at least one search filter');
  } else {
    topic.filters.forEach((filter, index) => {
      const filterValidation = validateSearchFilter(filter);
      if (!filterValidation.valid) {
        errors.push(`Filter ${index + 1}: ${filterValidation.errors.join(', ')}`);
      }
    });
  }

  // Validate notification config
  if (typeof topic.notification !== 'object' || topic.notification === null) {
    errors.push('Topic must have a notification configuration');
  } else {
    if (typeof topic.notification.enabled !== 'boolean') {
      errors.push('Notification enabled flag must be a boolean');
    }

    if (topic.notification.throttle) {
      const { maxPerHour, maxPerDay } = topic.notification.throttle;
      if (maxPerHour !== undefined && (typeof maxPerHour !== 'number' || maxPerHour < 0)) {
        errors.push('Notification maxPerHour must be a non-negative number when specified');
      }
      if (maxPerDay !== undefined && (typeof maxPerDay !== 'number' || maxPerDay < 0)) {
        errors.push('Notification maxPerDay must be a non-negative number when specified');
      }
    }
  }

  // Validate monitoring-specific fields
  if (topic.type !== undefined && !Object.values(MonitoringType).includes(topic.type)) {
    errors.push('Invalid monitoring type specified');
  }

  if (topic.groupId !== undefined && (typeof topic.groupId !== 'string' || topic.groupId.trim().length === 0)) {
    errors.push('Group ID must be a non-empty string when specified');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}