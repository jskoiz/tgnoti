import { AppConfig, TwitterConfig, TelegramConfig, MonitoringConfig } from './index.js';
import { validateRetryPolicy } from './retry.js';
import { validateTopicConfig } from './topics.js';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate Twitter configuration
 */
function validateTwitterConfig(config: TwitterConfig): ValidationResult {
  const errors: string[] = [];
  
  // Validate API config
  if (!config.api || typeof config.api !== 'object') {
    errors.push('Twitter API configuration must be provided');
  } else {
    if (!config.api.bearerToken || typeof config.api.bearerToken !== 'string') {
      errors.push('Twitter bearer token must be provided');
    }
    if (typeof config.api.timeout !== 'number' || config.api.timeout <= 0) {
      errors.push('Twitter API timeout must be a positive number');
    }
  }

  // Validate retry policy
  const retryValidation = validateRetryPolicy(config.retry);
  if (!retryValidation.valid) {
    errors.push(`Twitter retry policy: ${retryValidation.errors.join(', ')}`);
  }

  // Validate rate limit config
  if (!config.rateLimit || typeof config.rateLimit !== 'object') {
    errors.push('Twitter rate limit configuration must be provided');
  } else {
    if (typeof config.rateLimit.defaultRate !== 'number' || config.rateLimit.defaultRate <= 0) {
      errors.push('Twitter rate limit defaultRate must be a positive number');
    }
    if (typeof config.rateLimit.minRate !== 'number' || config.rateLimit.minRate <= 0) {
      errors.push('Twitter rate limit minRate must be a positive number');
    }
    if (typeof config.rateLimit.queueCheckInterval !== 'number' || config.rateLimit.queueCheckInterval <= 0) {
      errors.push('Twitter rate limit queueCheckInterval must be a positive number');
    }
  }

  // Validate cache config
  if (!config.cache || typeof config.cache !== 'object') {
    errors.push('Twitter cache configuration must be provided');
  } else {
    if (typeof config.cache.userDetailsTTL !== 'number' || config.cache.userDetailsTTL <= 0) {
      errors.push('Twitter cache TTL must be a positive number');
    }
    if (typeof config.cache.maxEntries !== 'number' || config.cache.maxEntries <= 0) {
      errors.push('Twitter cache maxEntries must be a positive number');
    }
  }

  // Validate circuit breaker config
  if (!config.circuitBreaker || typeof config.circuitBreaker !== 'object') {
    errors.push('Twitter circuit breaker configuration must be provided');
  } else {
    if (typeof config.circuitBreaker.failureThreshold !== 'number' || config.circuitBreaker.failureThreshold <= 0) {
      errors.push('Twitter circuit breaker failureThreshold must be a positive number');
    }
    if (typeof config.circuitBreaker.resetTimeout !== 'number' || config.circuitBreaker.resetTimeout <= 0) {
      errors.push('Twitter circuit breaker resetTimeout must be a positive number');
    }
  }

  // Validate GraphQL config
  if (!config.graphql || typeof config.graphql !== 'object') {
    errors.push('Twitter GraphQL configuration must be provided');
  } else {
    if (!config.graphql.baseUrl || typeof config.graphql.baseUrl !== 'string') {
      errors.push('Twitter GraphQL baseUrl must be provided');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate Telegram configuration
 */
function validateTelegramConfig(config: TelegramConfig): ValidationResult {
  const errors: string[] = [];

  // Validate bot token
  if (!config.api.botToken || typeof config.api.botToken !== 'string' || config.api.botToken.trim().length === 0) {
    errors.push('Telegram bot token must be provided');
  }

  // Validate group ID
  if (!config.api.groupId || typeof config.api.groupId !== 'string' || config.api.groupId.trim().length === 0) {
    errors.push('Telegram group ID must be provided');
  }

  // Validate default topic ID
  if (typeof config.defaultTopicId !== 'number' || config.defaultTopicId < 0) {
    errors.push('Telegram default topic ID must be a non-negative number');
  }

  // Validate retry policy
  const retryValidation = validateRetryPolicy(config.retry);
  if (!retryValidation.valid) {
    errors.push(`Telegram retry policy: ${retryValidation.errors.join(', ')}`);
  }

  // Validate queue check interval
  if (typeof config.queueCheckInterval !== 'number' || config.queueCheckInterval <= 0) {
    errors.push('Telegram queue check interval must be a positive number');
  }

  // Validate icons
  if (!config.icons || typeof config.icons !== 'object') {
    errors.push('Telegram icons configuration must be provided');
  } else {
    // Validate each required icon
    if (!config.icons.NEW_CONVERSATION || typeof config.icons.NEW_CONVERSATION !== 'string') {
      errors.push('NEW_CONVERSATION icon must be provided');
    }
    if (!config.icons.NEW_MESSAGE || typeof config.icons.NEW_MESSAGE !== 'string') {
      errors.push('NEW_MESSAGE icon must be provided');
    }
    if (!config.icons.SYSTEM || typeof config.icons.SYSTEM !== 'string') {
      errors.push('SYSTEM icon must be provided');
    }
    if (!config.icons.TROJAN || typeof config.icons.TROJAN !== 'string') {
      errors.push('TROJAN icon must be provided');
    }
    if (!config.icons.COMPETITOR || typeof config.icons.COMPETITOR !== 'string') {
      errors.push('COMPETITOR icon must be provided');
    }
    if (!config.icons.KOL || typeof config.icons.KOL !== 'string') {
      errors.push('KOL icon must be provided');
    }
  }

  // Validate message options
  if (!config.messageOptions || typeof config.messageOptions !== 'object') {
    errors.push('Telegram message options must be provided');
  } else {
    if (config.messageOptions.parse_mode !== 'HTML') {
      errors.push('Telegram message parse mode must be HTML');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate monitoring configuration
 */
function validateMonitoringConfig(config: MonitoringConfig): ValidationResult {
  const errors: string[] = [];

  // Validate group ID
  if (!config.groupId || typeof config.groupId !== 'string') {
    errors.push('Monitoring group ID must be provided');
  }

  // Validate topics
  if (!config.topics || typeof config.topics !== 'object') {
    errors.push('Monitoring topics must be provided');
  }

  // Validate polling configuration
  if (!config.polling || typeof config.polling !== 'object') {
    errors.push('Monitoring polling configuration must be provided');
  } else {
    if (typeof config.polling.intervalMinutes !== 'number' || config.polling.intervalMinutes <= 0) {
      errors.push('Monitoring polling interval must be a positive number');
    }
    if (typeof config.polling.maxResults !== 'number' || config.polling.maxResults <= 0) {
      errors.push('Monitoring max results must be a positive number');
    }
    if (typeof config.polling.timeWindowHours !== 'number' || config.polling.timeWindowHours <= 0) {
      errors.push('Monitoring time window must be a positive number');
    }
    if (typeof config.polling.batchSize !== 'number' || config.polling.batchSize <= 0) {
      errors.push('Monitoring batch size must be a positive number');
    }
    
    const retryValidation = validateRetryPolicy(config.polling.retry);
    if (!retryValidation.valid) {
      errors.push(`Monitoring polling retry policy: ${retryValidation.errors.join(', ')}`);
    }
  }

  // Validate fields configuration
  if (!config.fields || typeof config.fields !== 'object') {
    errors.push('Monitoring fields configuration must be provided');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate complete application configuration
 */
export function validateConfig(config: AppConfig): ValidationResult {
  const errors: string[] = [];

  // Validate Twitter config
  const twitterValidation = validateTwitterConfig(config.twitter);
  if (!twitterValidation.valid) {
    errors.push(...twitterValidation.errors.map(e => `Twitter config: ${e}`));
  }

  // Validate Telegram config
  const telegramValidation = validateTelegramConfig(config.telegram);
  if (!telegramValidation.valid) {
    errors.push(...telegramValidation.errors.map(e => `Telegram config: ${e}`));
  }

  // Validate monitoring config
  const monitoringValidation = validateMonitoringConfig(config.monitoring);
  if (!monitoringValidation.valid) {
    errors.push(...monitoringValidation.errors.map(e => `Monitoring config: ${e}`));
  }

  // Validate topics
  if (!Array.isArray(config.topics)) {
    errors.push('Topics must be an array');
  } else {
    config.topics.forEach((topic, index) => {
      const topicValidation = validateTopicConfig(topic);
      if (!topicValidation.valid) {
        errors.push(`Topic ${index + 1} (${topic.name}): ${topicValidation.errors.join(', ')}`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}