import { RetryPolicy } from './environment.js';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenTimeout: number;
}

export interface MonitoringAccount {
  topicId: number;
  account: string;
}

export const MONITORING_ACCOUNTS: MonitoringAccount[] = [
  {
    topicId: 5572,
    account: 'tradewithPhoton'
  },
  {
    topicId: 5573,
    account: 'bullx_io'
  },
  {
    topicId: 5574,
    account: 'TradeonNova'
  },
  {
    topicId: 6355,
    account: 'MaestroBots'
  },
  {
    topicId: 6317,
    account: 'bonkbot_io'
  },
  {
    topicId: 6314,
    account: 'gmgnai'
  },
  {
    topicId: 6320,
    account: 'BloomTradingBot'
  },
  {
    topicId: 381,
    account: 'TrojanOnSolana'
  },
  {
    topicId: 381,
    account: 'TrojanTrading'
  }
];

export interface MonitoringConfig {
  topics: Record<string, any>;
  groupId: string;
  polling: {
    intervalMinutes: number;
    maxResults: number;
    timeWindowHours: number;
    batchSize: number;
    retry: RetryPolicy;
  };
  fields: {
    tweet: string[];
    expansions: string[];
    media: string[];
    user: string[];
  };
}
