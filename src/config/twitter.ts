/**
 * Twitter configuration types
 */

// Rate limiting configuration
export interface RateLimitConfig {
  requestsPerSecond: number;  // From TWITTER_RATE_LIMIT
  minRate: number;            // From TWITTER_MIN_RATE
  safetyFactor: number;       // Default 0.75
  topicDelay: number;         // From TWITTER_TOPIC_DELAY_MS
  backoff: {
    initialDelay: number;     // Default 1000ms
    maxDelay: number;         // Default 60000ms
    multiplier: number;       // Default 3
  };
  cooldown: {
    duration: number;         // Default 15 minutes
    retryAfter: number;      // Default 15000ms
  };
}

// Complete Twitter configuration
export interface TwitterConfigV2 {
  api: {
    bearerToken: string;
    keys: {
      main: string;
      additional: string[];
    };
    timeout: number;
    headers: {
      'x-twitter-client-language': string;
      'x-twitter-active-user': string;
      'x-twitter-auth-type': string;
    };
  };
  rateLimit: RateLimitConfig;
  cache: {
    userDetailsTTL: number;
    maxEntries: number;
  };
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
    maxRetries: number;
  };
  graphql: {
    baseUrl: string;
    teamMembersEndpoint: string;
    defaultVariables: Record<string, any>;
    features: Record<string, boolean>;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    jitter: boolean;
  };
  searchWindow: {
    defaultWindowMinutes: number;
    overlapBufferMinutes: number;
  };
}
