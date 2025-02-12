// Define monitoring type as an enum
export enum MonitoringType {
  Mention = 'mention',
  Account = 'account'
}

// Define notification type as an enum
export enum NotificationType {
  Tweet = 'TWEET'
}

// Define source type as an enum
export enum SourceType {
  Tweet = 'tweet'
}

export interface FilterOptions {
  excludeRetweets: boolean;
  excludeQuotes: boolean;
  excludeReplies: boolean;
  // Make these required with empty arrays as default
  excludeUsernames: string[];
  excludePatterns: string[];
}

export interface TopicFilters {
  // Make these required with empty arrays as default
  mentions: string[];
  accounts: string[];
}

export interface TopicConfig {
  id: number;
  name: string;
  type: MonitoringType;
  filters: TopicFilters;
  searchQuery: string;
  filterOptions: FilterOptions;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface PollingConfig {
  intervalMinutes: number;
  maxResults: number;
  timeWindowHours: number;
  batchSize: number;
  retry: RetryConfig;
}

export interface MonitoringConfig {
  groupId: string;
  topics: {
    [key: string]: TopicConfig;
  };
  polling: PollingConfig;
  fields: {
    tweet: string[];
    expansions: string[];
    media: string[];
    user: string[];
  };
}

// Topic state tracking
export interface TopicState {
  topicId: number;
  lastProcessedId: string;
  lastUpdateTime: number;
}

// Database schema extensions
export interface MonitoredMessage {
  id: string;
  topicId: number;
  messageType: SourceType;
  content: string;
  processed: boolean;
  processedAt: number;
  metadata: {
    authorId?: string;
    conversationId?: string;
    referencedTweets?: any[];
  };
}

// Message filtering strategies
export interface FilterStrategy {
  type: MonitoringType;
  matches(tweet: any, filters: TopicFilters): boolean;
}

// Queue metadata
export interface MonitoringMetadata {
  topicId: number;
  topicName: string;
  monitoringType: MonitoringType;
}

// Extended queue item metadata
export interface ExtendedQueueItemMetadata {
  notificationType: NotificationType;
  sourceType: SourceType;
  monitoring?: MonitoringMetadata;
}

// Tweet processing result
export interface ProcessedTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  conversation_id?: string;
  referenced_tweets?: any[];
  topics: number[];
  user?: {
    id: string;
    username: string;
    name: string;
    created_at: string;
    public_metrics: {
      following_count: number;
      followers_count: number;
    };
  };
  media?: {
    media_key: string;
    type: string;
    url: string;
    preview_image_url?: string;
  }[];
}

// Topic state update operation
export interface TopicStateUpdate {
  topicId: number;
  tweetId: string;
  timestamp: number;
}

// Topic state query result
export interface TopicStateQuery {
  topicId: number;
  lastProcessedId?: string;
  lastUpdateTime: number;
}
