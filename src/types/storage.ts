export interface TopicState {
  lastId: string;
  lastUpdate: number;
}

export interface SeenTweet {
  topicIds: string[];
  processed: boolean;
  timestamp: number;
}

export interface RawSearchQueryConfig {
  query: string;
  excludeRetweets?: boolean;
  language?: string;
  type: 'raw';
}

export interface StructuredSearchQueryConfig {
  accounts?: string[];
  mentions?: string[];
  excludeAccounts?: string[];
  excludeQuotes?: boolean;
  excludeRetweets?: boolean;
  language?: string;
  keywords?: string[];
  operator?: 'AND' | 'OR';
  startTime?: string;
  type: 'structured';
}

export type SearchQueryConfig = RawSearchQueryConfig | StructuredSearchQueryConfig;

export interface TwitterConfig {
  bearerToken: string;
  searchQueries: {
    [key: string]: SearchQueryConfig;
  };
  pollingInterval: number;
}

export interface TelegramTopicConfig {
  name: string;
  description?: string;
  filters?: {
    users: string[];
    mentions: string[];
    keywords: string[];
  };
}

export interface TelegramConfig {
  botToken: string;
  groupId: string;
  defaultTopicId: string;
  retryAttempts: number;
  topics?: {
    [topicId: string]: TelegramTopicConfig;
  };
}

export interface Config {
  twitter: TwitterConfig;
  telegram: TelegramConfig;
}