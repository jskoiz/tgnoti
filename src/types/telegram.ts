import { Message } from 'node-telegram-bot-api';

// Existing types
export interface TelegramBotConfig {
  botToken: string;
  groupId: string;
  retryAttempts: number;
  defaultTopicId: string;
}

export interface TelegramMessage extends Message {
  message_thread_id?: number;
}

export interface FormattedMessage {
  text?: string;
  photo?: string;
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  message_thread_id?: number;
  disable_web_page_preview?: boolean;
  reply_markup?: any;
}

export interface TweetMessageConfig {
  tweet: any;
  quotedTweet?: any;
  showSummarizeButton?: boolean;
  translationMessage?: string;
}

export interface TweetFormatter {
  formatMessage(config: TweetMessageConfig): string;
  createMessageButtons(tweet: any, config: TweetMessageConfig): any[][];
}

// New Queue-related types
export interface QueuedMessage {
  chatId: number;
  threadId?: number;
  content: string;
  messageOptions: any;
  priority: number;
  retryCount: number;
  firstAttempt: Date;
  lastAttempt?: Date;
  nextAttemptTime?: Date;
  id: string; // Unique identifier for the message
}

export interface TelegramQueueMetrics {
  queueLength: number;
  processingTime: number;
  successRate: number;
  failureRate: number;
  rateLimitHits: number;
  averageRetryCount: number;
}

export interface TelegramQueueConfig {
  baseDelayMs: number; // Base delay between messages
  rateLimitWindowMs: number; // Time window for rate limiting
  maxMessagesPerWindow: number; // Maximum messages allowed in window
  maxRetries: number; // Maximum number of retry attempts
  maxQueueSize: number; // Maximum size of the queue
  persistenceEnabled: boolean; // Whether to persist queue to disk
}

export interface ITelegramMessageQueue {
  queueMessage(message: Omit<QueuedMessage, 'id' | 'firstAttempt' | 'retryCount'>): Promise<string>;
  getQueueLength(): number;
  getMetrics(): TelegramQueueMetrics;
  clearQueue(): Promise<void>;
  pauseProcessing(): void;
  resumeProcessing(): void;
  getQueueStatus(): {
    isProcessing: boolean;
    isPaused: boolean;
    currentQueueSize: number;
  };
}

export interface TelegramError extends Error {
  code: string;
  response?: {
    statusCode: number;
    body: any;
    headers: {
      'retry-after'?: string;
    };
  };
}

export type SendMessageResult = {
  success: boolean;
  message?: Message;
  error?: TelegramError;
  retryAfter?: number;
};

export interface TopicConfig {
  id: string;
  fallbackId?: string;
  isRequired?: boolean;
}

export const TOPIC_CONFIG: Record<string, TopicConfig> = {
  GENERAL: {
    id: "1", // Default general topic ID
    isRequired: true
  }
};