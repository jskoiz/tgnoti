import { Tweet } from './twitter.js';
import { TopicConfig } from '../config/unified.js';

export interface DeliveryMethod {
  name: string;
  enabled: boolean;
  priority: number; // Lower number = higher priority
}

export interface DeliveryConfig {
  primary: DeliveryMethod;
  fallback?: DeliveryMethod[];
}

export interface IDeliveryService {
  sendTweetNotification(tweet: Tweet, topic: TopicConfig): Promise<void>;
  getQueueLength(): number;
  getMetrics(): DeliveryMetrics;
}

export interface DeliveryMetrics {
  queued: number;
  sent: number;
  errors: number;
  dropped: number;
}

export type DeliveryMethodType = 'telegram' | 'discord' | 'slack' | 'webhook';

export interface TopicDeliveryConfig {
  topicId: number;
  deliveryMethods: {
    [key in DeliveryMethodType]?: {
      enabled: boolean;
      priority: number;
      config?: any;
    };
  };
}