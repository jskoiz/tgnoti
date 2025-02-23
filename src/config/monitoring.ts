import { MonitoringType, TopicConfig } from './topics.js';
import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry.js';
import { getFilterStrategy, matchesTopic } from './filterStrategies.js';

/**
 * Twitter API field configuration
 */
export interface TwitterFields {
  tweet: string[];
  expansions: string[];
  media: string[];
  user: string[];
}

/**
 * Polling configuration
 */
export interface PollingConfig {
  intervalMinutes: number;
  maxResults: number;
  timeWindowHours: number;
  batchSize: number;
  retry: RetryPolicy;
}

/**
 * Complete monitoring configuration
 */
export interface MonitoringConfig {
  groupId: string;
  topics: Record<string, TopicConfig>;
  polling: PollingConfig;
  fields: TwitterFields;
}

/**
 * Default monitoring configuration
 */
export const monitoringConfig: MonitoringConfig = {
  groupId: "-1002379334714",
  topics: {
    trojan: {
      id: 381,
      name: "Trojan Monitor",
      enabled: true,
      type: MonitoringType.Mention,
      filters: [{
        mentions: ["@TrojanOnSolana", "@TrojanTrading"],
        accounts: [],
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: [],
        searchQuery: "(TrojanOnSolana OR TrojanTrading OR \"Trojan Trading\" OR \"Trojan On Solana\")"
      }],
      retryPolicy: DEFAULT_RETRY_POLICY,
      notification: {
        enabled: true,
        format: {
          includeMetrics: true,
          includeLinks: true
        }
      }
    },
    trojanSolana: {
      id: 5026,
      name: "Trojan Solana Monitor",
      enabled: true,
      type: MonitoringType.Mention,
      filters: [{
        mentions: ["@TrojanOnSolana"],
        accounts: [],
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: [],
        searchQuery: "(TrojanOnSolana OR \"Trojan On Solana\")"
      }],
      retryPolicy: DEFAULT_RETRY_POLICY,
      notification: {
        enabled: true,
        format: {
          includeMetrics: true,
          includeLinks: true
        }
      }
    },
    competitor: {
      id: 377,
      name: "Competitor Monitor",
      enabled: true,
      type: MonitoringType.Mention,
      filters: [{
        mentions: [],
        accounts: [],
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: [],
        searchQuery: "(tradewithPhoton OR bullx_io OR TradeonNova OR BloomTradingBot OR bonkbot_io)"
      }],
      retryPolicy: DEFAULT_RETRY_POLICY,
      notification: {
        enabled: true,
        format: {
          includeMetrics: true,
          includeLinks: true
        }
      }
    },
    kol: {
      id: 379,
      name: "KOL Monitor",
      enabled: true,
      type: MonitoringType.Account,
      filters: [{
        accounts: ["@reethmos"],
        mentions: [],
        excludeRetweets: true,
        excludeQuotes: true,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: [],
        searchQuery: "from:reethmos"
      }],
      retryPolicy: DEFAULT_RETRY_POLICY,
      notification: {
        enabled: true,
        format: {
          includeMetrics: true,
          includeLinks: true
        }
      }
    },
    competitorTweets: {
      id: 885,
      name: "Competitor Tweets",
      enabled: true,
      type: MonitoringType.Account,
      filters: [{
        accounts: [
          "@bullx_io",
          "@TradeonNova",
          "@BloomTradingBot",
          "@bonkbot_io"
        ],
        mentions: [],
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: [],
        searchQuery: "(from:bullx_io OR from:TradeonNova OR from:BloomTradingBot OR from:bonkbot_io)"
      }],
      retryPolicy: DEFAULT_RETRY_POLICY,
      notification: {
        enabled: true,
        format: {
          includeMetrics: true,
          includeLinks: true
        }
      }
    }
  },
  polling: {
    intervalMinutes: 0.5, // 30 seconds
    maxResults: 50,
    timeWindowHours: 120, // 5 days
    batchSize: 50,
    retry: {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 60000,
      jitter: true
    }
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

/**
 * Helper to get topic by ID
 */
export function getTopicById(topicId: number): [string, TopicConfig] | undefined {
  const entry = Object.entries(monitoringConfig.topics)
    .find(([_, topic]) => topic.id === topicId);
  return entry;
}

export { getFilterStrategy, matchesTopic };
