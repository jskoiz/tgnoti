import { MonitoringConfig, TopicConfig, MonitoringType, FilterStrategy } from '../types/monitoring.js';

export const monitoringConfig: MonitoringConfig = {
  groupId: "-1002379334714",
  topics: {
    trojan: {
      id: 381,
      name: "Trojan Monitor",
      type: MonitoringType.Mention,
      filters: {
        mentions: ["@TrojanOnSolana", "@TrojanTrading"],
        accounts: [] // Required field with empty array
      },
      searchQuery: "(TrojanOnSolana OR TrojanTrading OR \"Trojan Trading\" OR \"Trojan On Solana\")",
      filterOptions: {
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: []
      }
    },
    competitor: {
      id: 377,
      name: "Competitor Monitor",
      type: MonitoringType.Mention,
      filters: {
        mentions: [
          //"@tradewithPhoton",
         // "@bullx_io",
         // "@TradeonNova",
        //  "@BloomTradingBot",
        //  "@bonkbot_io"
        ],
        accounts: [] // Required field with empty array
      },
      searchQuery: "(tradewithPhoton OR bullx_io OR TradeonNova OR BloomTradingBot OR bonkbot_io)",
      filterOptions: {
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: []
      }
    },
    kol: {
      id: 379,
      name: "KOL Monitor", 
      type: MonitoringType.Account,
      filters: {
        accounts: ["@reethmos"],
        mentions: [] // Required field with empty array
      },
      searchQuery: "from:reethmos",
      filterOptions: {
        excludeRetweets: true,
        excludeQuotes: true,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: []
      }
    },
    competitorTweets: {
      id: 885,
      name: "Competitor Tweets",
      type: MonitoringType.Account,
      filters: {
        accounts: [
          "@bullx_io",
          "@TradeonNova",
          "@BloomTradingBot",
          "@bonkbot_io"
        ],
        mentions: [] // Required field with empty array
      },
      searchQuery: "(from:bullx_io OR from:TradeonNova OR from:BloomTradingBot OR from:bonkbot_io)",
      filterOptions: {
        excludeRetweets: true,
        excludeQuotes: false,
        excludeReplies: false,
        excludeUsernames: [],
        excludePatterns: []
      }
    }
  },
  polling: {
    intervalMinutes: 0.5, // 30 seconds
    maxResults: 50, // Increased to get more tweets per request
    timeWindowHours: 24, // Extended to 24 hours for better coverage
    batchSize: 50, // Increased to match maxResults
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 60000
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

// Filter strategy implementations
export const mentionFilterStrategy: FilterStrategy = {
  type: MonitoringType.Mention,
  matches: (tweet: any, filters: TopicConfig['filters']) => {
    if (!filters.mentions.length) return false;
    
    const tweetText = tweet.text.toLowerCase();
    return filters.mentions.some(mention => 
      tweetText.includes(mention.toLowerCase())
    );
  }
};

export const accountFilterStrategy: FilterStrategy = {
  type: MonitoringType.Account,
  matches: (tweet: any, filters: TopicConfig['filters']) => {
    if (!filters.accounts.length) return false;
    
    const authorUsername = tweet.author.username.toLowerCase();
    return filters.accounts.some(account => 
      authorUsername === account.toLowerCase().replace('@', '')
    );
  }
};

// Get filter strategy based on monitoring type
export const getFilterStrategy = (type: MonitoringType): FilterStrategy => {
  switch (type) {
    case MonitoringType.Mention:
      return mentionFilterStrategy;
    case MonitoringType.Account:
      return accountFilterStrategy;
    default:
      throw new Error(`Unknown monitoring type: ${type}`);
  }
};

// Helper to get topic by ID
export const getTopicById = (topicId: number): [string, TopicConfig] | undefined => {
  const entry = Object.entries(monitoringConfig.topics)
    .find(([_, topic]) => topic.id === topicId);
  return entry;
};

// Helper to check if a tweet matches a topic's filters
export const matchesTopic = (tweet: any, topic: TopicConfig): boolean => {
  const strategy = getFilterStrategy(topic.type);
  return strategy.matches(tweet, topic.filters);
};
