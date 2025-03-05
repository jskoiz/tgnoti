/**
 * Twitter configuration types
 */

// Rate limiting configuration
export interface RateLimitConfig {
  requestsPerSecond: number;  // From TWITTER_RATE_LIMIT
  safetyFactor: number;       // Default 0.75
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
