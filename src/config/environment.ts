import { injectable, inject } from 'inversify';
import { AppConfig } from './index.js';
import { DEFAULT_RETRY_POLICY, RetryPolicy } from './retry.js';
import { TwitterConfig } from './twitter.js';
import { TelegramConfig } from './telegram.js';
import { MonitoringConfig } from './monitoring.js';
import { validateConfig } from './validation.js';
import { Logger } from '../types/logger.js';
import { ConfigManager } from './ConfigManager.js';
import { TYPES } from '../types/di.js';

/**
 * Environment variable names
 */
const ENV = {
  // Twitter
  TWITTER_API_KEY: 'RETTIWT_API_KEY',
  TWITTER_BEARER_TOKEN: 'BEARER_TOKEN',
  TWITTER_TIMEOUT: 'TWITTER_TIMEOUT',
  TWITTER_RATE_LIMIT: 'TWITTER_RATE_LIMIT',
  TWITTER_MIN_RATE: 'TWITTER_MIN_RATE',
  TWITTER_QUEUE_CHECK_INTERVAL: 'TWITTER_QUEUE_CHECK_INTERVAL',
  TWITTER_CACHE_TTL: 'TWITTER_CACHE_TTL',
  TWITTER_CACHE_MAX_ENTRIES: 'TWITTER_CACHE_MAX_ENTRIES',
  
  // Telegram
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  STAGING_TELEGRAM_BOT_TOKEN: 'STAGING_TELEGRAM_BOT_TOKEN',
  TELEGRAM_CHAT_ID: 'TELEGRAM_GROUP_ID',
  TELEGRAM_DEFAULT_TOPIC_ID: 'TELEGRAM_DEFAULT_TOPIC_ID',
  TELEGRAM_QUEUE_CHECK_INTERVAL: 'TELEGRAM_QUEUE_CHECK_INTERVAL',
  
  // Monitoring
  MONITORING_GROUP_ID: 'TELEGRAM_GROUP_ID',  // Using same group ID as Telegram
  MONITORING_INTERVAL_MINUTES: 'MONITORING_INTERVAL_MINUTES',
  MONITORING_MAX_RESULTS: 'MONITORING_MAX_RESULTS',
  MONITORING_TIME_WINDOW_HOURS: 'MONITORING_TIME_WINDOW_HOURS',
  MONITORING_BATCH_SIZE: 'MONITORING_BATCH_SIZE',

  // Common
  RETRY_MAX_ATTEMPTS: 'RETRY_MAX_ATTEMPTS',
  RETRY_BASE_DELAY: 'RETRY_BASE_DELAY',
  RETRY_MAX_DELAY: 'RETRY_MAX_DELAY',
  RETRY_JITTER: 'RETRY_JITTER'
} as const;

/**
 * Default configuration values
 */
const DEFAULTS = {
  twitter: {
    timeout: 10000,
    rateLimit: {
      defaultRate: 1,
      minRate: 0.1,
      queueCheckInterval: 1000
    },
    cache: {
      userDetailsTTL: 5 * 60 * 1000,
      maxEntries: 1000
    }
  },
  telegram: {
    queueCheckInterval: 30000,
    defaultTopicId: 381
  },
  monitoring: {
    intervalMinutes: 0.5,
    maxResults: 50,
    timeWindowHours: 24,
    batchSize: 50
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    jitter: true
  }
};

/**
 * Helper function to parse retry policy from environment
 */
function getRetryPolicy(): RetryPolicy {
  return {
    maxAttempts: getEnvNumber('RETRY_MAX_ATTEMPTS', DEFAULTS.retry.maxAttempts),
    baseDelay: getEnvNumber('RETRY_BASE_DELAY', DEFAULTS.retry.baseDelay),
    maxDelay: getEnvNumber('RETRY_MAX_DELAY', DEFAULTS.retry.maxDelay),
    jitter: getEnvBool('RETRY_JITTER', DEFAULTS.retry.jitter)
  }
};

/**
 * Helper function to get environment variable with type checking
 */
function getEnvVar(name: keyof typeof ENV, required = false): string | undefined {
  const value = process.env[ENV[name]];
  if (required && !value) {
    throw new Error(`Required environment variable ${ENV[name]} is not set`);
  }
  return value;
}

/**
 * Helper function to parse boolean environment variable
 */
function getEnvBool(name: keyof typeof ENV, defaultValue: boolean): boolean {
  const value = getEnvVar(name);
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Helper function to parse number environment variable
 */
function getEnvNumber(name: keyof typeof ENV, defaultValue: number): number {
  const value = getEnvVar(name);
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Environment management class
 */
@injectable()
export class Environment {
  private config: AppConfig | null = null;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager
  ) {}

  /**
   * Validate all required environment variables are set
   */
  validateEnvironment(): void {
    const requiredVars = [
      'TWITTER_API_KEY',
      'TWITTER_BEARER_TOKEN',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_CHAT_ID'
    ] as const;

    const missing = requiredVars.filter(name => !getEnvVar(name));
    
    if (missing.length > 0) {
      const missingVars = missing.map(name => ENV[name]).join(', ');
      this.logger.error(`Missing required environment variables: ${missingVars}`);
      throw new Error(`Missing required environment variables: ${missingVars}`);
    }

    this.logger.info('Environment validation successful');
  }

  /**
   * Load configuration from environment variables
   */
  loadConfig(): AppConfig {
    if (this.config) {
      return this.config;
    }

    this.logger.debug('Loading configuration from environment');

    // First validate environment
    this.validateEnvironment();

    const retryPolicy = getRetryPolicy();

    // Load Twitter configuration
    const twitter = {
      api: {
        bearerToken: getEnvVar('TWITTER_BEARER_TOKEN', true)!,
        timeout: getEnvNumber('TWITTER_TIMEOUT', DEFAULTS.twitter.timeout),
        headers: {
          'x-twitter-client-language': 'en',
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session'
        }
      },
      rateLimit: {
        defaultRate: getEnvNumber('TWITTER_RATE_LIMIT', DEFAULTS.twitter.rateLimit.defaultRate),
        minRate: getEnvNumber('TWITTER_MIN_RATE', DEFAULTS.twitter.rateLimit.minRate),
        queueCheckInterval: getEnvNumber('TWITTER_QUEUE_CHECK_INTERVAL', DEFAULTS.twitter.rateLimit.queueCheckInterval),
        retryAfterMultiplier: 1.5
      },
      cache: {
        userDetailsTTL: getEnvNumber('TWITTER_CACHE_TTL', DEFAULTS.twitter.cache.userDetailsTTL),
        maxEntries: getEnvNumber('TWITTER_CACHE_MAX_ENTRIES', DEFAULTS.twitter.cache.maxEntries)
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
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
      retry: retryPolicy,
      searchWindow: {
        pastDays: 30,
        futureDays: 7,
        defaultWindow: 30
      }
    };
 
    // Load Telegram configuration
    const telegram = {
      defaultTopicId: getEnvNumber('TELEGRAM_DEFAULT_TOPIC_ID', DEFAULTS.telegram.defaultTopicId),
      api: {
        botToken: process.env.NODE_ENV === 'development' 
          ? getEnvVar('STAGING_TELEGRAM_BOT_TOKEN', true)! 
          : getEnvVar('TELEGRAM_BOT_TOKEN', true)!,
        groupId: getEnvVar('TELEGRAM_CHAT_ID', true)!
      },
      retry: retryPolicy,
      queueCheckInterval: getEnvNumber('TELEGRAM_QUEUE_CHECK_INTERVAL', DEFAULTS.telegram.queueCheckInterval),
      icons: {
        NEW_CONVERSATION: '🆕',
        NEW_MESSAGE: '💬',
        SYSTEM: '🤖',
        TROJAN: '🔍',
        COMPETITOR: '👀',
        KOL: '🌟'
      },
      messageOptions: {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      },
      topicIds: { // TODO: Move to topics.ts
        TROJAN: 381,
        COMPETITOR: 377,
        KOL: 379
      }
    };
 
    // Load monitoring configuration
    const monitoring = {
      topics: {},  // Will be populated from topics.ts
      groupId: getEnvVar('MONITORING_GROUP_ID', true)!,
      polling: {
        intervalMinutes: getEnvNumber('MONITORING_INTERVAL_MINUTES', DEFAULTS.monitoring.intervalMinutes),
        maxResults: getEnvNumber('MONITORING_MAX_RESULTS', DEFAULTS.monitoring.maxResults),
        timeWindowHours: getEnvNumber('MONITORING_TIME_WINDOW_HOURS', DEFAULTS.monitoring.timeWindowHours),
        batchSize: getEnvNumber('MONITORING_BATCH_SIZE', DEFAULTS.monitoring.batchSize),
        retry: retryPolicy
      },
      fields: {
        tweet: [
          "author_id",
          "created_at",
          "text",
          "referenced_tweets",
          "conversation_id",
          "attachments"
        ],
        expansions: [
          "referenced_tweets.id",
          "author_id",
          "attachments.media_keys",
          "referenced_tweets.id.author_id"
        ],
        media: [
          "type",
          "url",
          "preview_image_url",
          "alt_text"
        ],
        user: [
          "id",
          "name",
          "username",
          "created_at",
          "public_metrics",
          "profile_image_url",
          "description",
          "protected",
          "verified",
          "url"
        ]
      }
    };
 
    // Create complete configuration
    this.config = {
      twitter,
      telegram: telegram as TelegramConfig, // Type assertion since we know the structure matches
      monitoring,
      topics: [] // Topics should be loaded separately from a configuration file
    };

    // Validate the configuration
    const validationResult = validateConfig(this.config!);
    if (!this.config || !validationResult.valid) {
      const errors = validationResult.errors.join(', ');
      this.logger.error(`Invalid configuration: ${errors}`);
      throw new Error(`Invalid configuration: ${errors}`);
    }

    this.logger.info('Configuration loaded successfully');
    return this.config as AppConfig;
  }

  /**
   * Get the current configuration
   */
  getConfig(): AppConfig {
    if (!this.config) {
      this.loadConfig();
    }
    return this.config as AppConfig;
  }
}