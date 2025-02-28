import { TelegramBotConfig } from './telegram.js';

export interface TwitterBotConfig {
  bearerToken: string;
  searchQueries: {
    [key: string]: any;
  };
  pollingInterval: number;
}

export interface Config {
  twitter: TwitterBotConfig;
  telegram: {
    botToken: string;
    groupId: string;
    retryAttempts?: number;
    defaultTopicId?: string;
    topics?: { [key: string]: any };
    topicIds?: { [key: string]: number };
  };
}

export interface SeenTweet {
  topicIds: string[];
  processed: boolean;
  timestamp: number;
}