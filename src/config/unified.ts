import { TOPIC_CONFIG } from './topicConfig.js';

export interface TopicConfig {
  id: number;
  name: string;
  accounts: string[];
  mentions?: string[];
  keywords?: string[];
  searchWindowMinutes?: number;
}

export interface TwitterConfig {
  api: {
    bearerToken: string;
    timeout: number;
    headers: Record<string, string>;
  };
  rateLimit: {
    requestsPerSecond: number;
    minRate: number;
    topicDelayMs: number;
    pollingIntervalMs: number;
  };
  searchWindow: {
    windowMinutes: number;
    overlapBufferMinutes: number;
  };
}

export interface TelegramConfig {
  api: {
    botToken: string;
    groupId: string;
  };
  defaultTopicId: number;
  messageOptions: {
    parse_mode: string;
    disable_web_page_preview: boolean;
  };
  icons: {
    NEW_CONVERSATION: string;
    NEW_MESSAGE: string;
    SYSTEM: string;
    TROJAN: string;
    COMPETITOR: string;
    KOL: string;
  };
}

export interface MongoDBConfig {
  uri: string;
  dbName: string;
  collections: {
    tweets: string;
    topicFilters: string;
  };
}

export interface SystemConfig {
  tweetCleanupAgeDays: number;
  tweetBatchSize: number;
  logLevel: string;
}

export interface UnifiedConfig {
  twitter: TwitterConfig;
  telegram: TelegramConfig;
  topics: TopicConfig[];
  mongodb: MongoDBConfig;
  system: SystemConfig;
}

// Convert existing topic config to new format
function convertTopicConfig(): TopicConfig[] {
  const topicMap = new Map<number, TopicConfig>();

  // Convert from TOPIC_CONFIG
  for (const [name, details] of Object.entries(TOPIC_CONFIG)) {
    const userFilters = details.filters
      .filter(f => f.type === 'user')
      .map(f => f.value);

    const mentionFilters = details.filters
      .filter(f => f.type === 'mention')
      .map(f => f.value);

    const keywordFilters = details.filters
      .filter(f => f.type === 'keyword')
      .map(f => f.value);

    // Create a more intuitive topic configuration
    let topic: TopicConfig = {
      id: details.id,
      name,
      accounts: userFilters,
      mentions: mentionFilters.length > 0 ? mentionFilters : undefined,
      keywords: keywordFilters.length > 0 ? keywordFilters : undefined
    };

    // For KOL_MONITORING, ensure we're explicitly setting up to monitor tweets FROM these accounts
    if (name === 'KOL_MONITORING') {
      // Log the KOL accounts we're monitoring for clarity
      console.log(`KOL_MONITORING configured to track tweets FROM: ${userFilters.join(', ')}`);
    }

    topicMap.set(details.id, topic);
  }

  return Array.from(topicMap.values());
}

export function loadConfig(): UnifiedConfig {
  // Load topics from existing configuration
  const topics = convertTopicConfig();
  
  return {
    twitter: {
      api: {
        bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
        timeout: Number(process.env.TWITTER_API_TIMEOUT) || 30000,
        headers: {
          'x-twitter-client-language': 'en',
          'x-twitter-active-user': 'yes',
          'x-twitter-auth-type': 'OAuth2Session'
        }
      },
      rateLimit: {
        requestsPerSecond: Number(process.env.TWITTER_RATE_LIMIT) || 1,
        minRate: Number(process.env.TWITTER_MIN_RATE) || 0.1,
        topicDelayMs: Number(process.env.TWITTER_TOPIC_DELAY_MS) || 10000,
        pollingIntervalMs: Number(process.env.TWITTER_POLLING_INTERVAL) || 180000
      },
      searchWindow: {
        windowMinutes: Number(process.env.SEARCH_WINDOW_MINUTES) || 10,
        overlapBufferMinutes: Number(process.env.SEARCH_OVERLAP_BUFFER_MINUTES) || 2
      }
    },
    telegram: {
      api: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        groupId: process.env.TELEGRAM_GROUP_ID || ''
      },
      defaultTopicId: 1,
      messageOptions: {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      },
      icons: {
        NEW_CONVERSATION: '🔵',
        NEW_MESSAGE: '🟢',
        SYSTEM: '⚙️',
        TROJAN: '🔱',
        COMPETITOR: '👀',
        KOL: '🔍'
      }
    },
    topics,
    mongodb: {
      uri: process.env.MONGO_DB_STRING || '',
      dbName: 'twitter_notifications',
      collections: {
        tweets: 'tweets',
        topicFilters: 'topic_filters'
      }
    },
    system: {
      tweetCleanupAgeDays: Number(process.env.TWEET_CLEANUP_AGE_DAYS) || 7,
      tweetBatchSize: Number(process.env.TWEET_BATCH_SIZE) || 50,
      logLevel: process.env.LOG_LEVEL || 'info'
    }
  };
}