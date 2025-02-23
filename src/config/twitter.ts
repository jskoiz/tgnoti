import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry.js';

/**
 * Twitter API configuration
 */
export interface TwitterApiConfig {
  bearerToken: string;
  timeout: number;
  headers: {
    'x-twitter-client-language': string;
    'x-twitter-active-user': string;
    'x-twitter-auth-type': string;
  };
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  defaultRate: number;
  minRate: number;
  queueCheckInterval: number;
  retryAfterMultiplier: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  userDetailsTTL: number; // Time to live in milliseconds
  maxEntries: number;
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  maxRetries: number;
}

/**
 * Search window configuration
 */
export interface SearchWindowConfig {
  pastDays: number;    // How many days in the past to search
  futureDays: number;  // How many days in the future to allow
  defaultWindow: number; // Default search window in days
}

/**
 * GraphQL endpoint configuration
 */
export interface GraphQLConfig {
  baseUrl: string;
  teamMembersEndpoint: string;
  defaultVariables: {
    count: number;
    teamName: string;
    includePromotedContent: boolean;
    withClientEventToken: boolean;
    withVoice: boolean;
  };
  features: {
    profile_label_improvements_pcf_label_in_post_enabled: boolean;
    rweb_tipjar_consumption_enabled: boolean;
    responsive_web_graphql_exclude_directive_enabled: boolean;
    verified_phone_label_enabled: boolean;
    creator_subscriptions_tweet_preview_api_enabled: boolean;
    responsive_web_graphql_timeline_navigation_enabled: boolean;
    responsive_web_graphql_skip_user_profile_image_extensions_enabled: boolean;
    premium_content_api_read_enabled: boolean;
    communities_web_enable_tweet_community_results_fetch: boolean;
  };
}

/**
 * Complete Twitter configuration
 */
export interface TwitterConfig {
  api: TwitterApiConfig;
  rateLimit: RateLimitConfig;
  cache: CacheConfig;
  circuitBreaker: CircuitBreakerConfig;
  graphql: GraphQLConfig;
  retry: RetryPolicy;
  searchWindow: SearchWindowConfig;
}

/**
 * Default Twitter configuration
 */
export const twitterConfig: TwitterConfig = {
  api: {
    bearerToken: process.env.BEARER_TOKEN || '',
    timeout: 10000, // 10 seconds
    headers: {
      'x-twitter-client-language': 'en',
      'x-twitter-active-user': 'yes',
      'x-twitter-auth-type': 'OAuth2Session'
    }
  },
  rateLimit: {
    defaultRate: 1,
    minRate: 0.1,
    queueCheckInterval: 1000,
    retryAfterMultiplier: 1.5
  },
  cache: {
    userDetailsTTL: 5 * 60 * 1000, // 5 minutes
    maxEntries: 1000
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    maxRetries: 3
  },
  graphql: {
    baseUrl: 'https://x.com/i/api/graphql',
    teamMembersEndpoint: '0M9yTHGhZjdIIxIcI9H2xQ/UserBusinessProfileTeamTimeline',
    defaultVariables: {
      count: 20,
      teamName: 'NotAssigned',
      includePromotedContent: false,
      withClientEventToken: false,
      withVoice: true
    },
    features: {
      profile_label_improvements_pcf_label_in_post_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true
    }
  },
  retry: {
    ...DEFAULT_RETRY_POLICY,
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000
  },
  searchWindow: {
    pastDays: 5,
    futureDays: 7,
    defaultWindow: 5  // Set to match pastDays for searching last 5 days only
  }
};

/**
 * Validate Twitter configuration
 */
export function validateTwitterConfig(config: Partial<TwitterConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate API config
  if (!config.api?.bearerToken) {
    errors.push('Bearer token is required');
  }

  // Validate rate limit config
  if (config.rateLimit) {
    if (config.rateLimit.defaultRate <= 0) {
      errors.push('Default rate must be greater than 0');
    }
    if (config.rateLimit.minRate <= 0) {
      errors.push('Minimum rate must be greater than 0');
    }
  }

  // Validate cache config
  if (config.cache) {
    if (config.cache.userDetailsTTL <= 0) {
      errors.push('Cache TTL must be greater than 0');
    }
    if (config.cache.maxEntries <= 0) {
      errors.push('Max cache entries must be greater than 0');
    }
  }

  // Validate circuit breaker config
  if (config.circuitBreaker) {
    if (config.circuitBreaker.failureThreshold <= 0) {
      errors.push('Circuit breaker failure threshold must be greater than 0');
    }
    if (config.circuitBreaker.resetTimeout <= 0) {
      errors.push('Circuit breaker reset timeout must be greater than 0');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
