import { Message } from 'node-telegram-bot-api';
import { TopicConfig } from './topics.js';
import { Tweet } from './twitter.js';

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
  replyToTweet?: any;
  showSummarizeButton?: boolean;
  mediaHandling?: 'inline' | 'attachment';
  translationMessage?: string;
}

export interface TweetFormatter {
  formatMessage(config: TweetMessageConfig): string;
  createMessageButtons(tweet: any, config: TweetMessageConfig): any[][];
}

// Interactive filter interface types
export interface CallbackQueryData {
  action: string;
  topicId: number;
  filterType?: string;
  filterValue?: string;
  page?: number;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
  url?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

// New Queue-related types
export interface QueuedMessage {
  chatId: number;
  threadId?: number;
  tweetId?: string;  // Made optional since not all messages are tweets
  content: string;
  messageOptions: any;
  tweetMetadata?: TweetMetadata;  // Added to pass tweet metadata through the queue
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
  maxDelayMs: number; // Maximum delay between messages (for exponential backoff)
  maxRetries: number; // Maximum number of retry attempts
  maxQueueSize: number; // Maximum size of the queue
  persistenceEnabled: boolean; // Whether to persist queue to disk
}

export interface ITelegramMessageQueue {
  queueMessage(message: Omit<QueuedMessage, 'id' | 'firstAttempt' | 'retryCount' | 'lastAttempt' | 'nextAttemptTime'>): Promise<string>;
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

export interface TweetMetadata {
  tweet: Tweet;
  matchedTopic?: string;
  redirectReason?: 'competitor_tweet' | 'competitor_mention';
  mentionedCompetitors?: string[];
  type: 'original' | 'reply' | 'quote';
  reason?: string; // Reason for validation/filtering failure
}

export interface ITelegramMessageSender {
  sendMessage(chatId: number, text: string, options?: any, metadata?: TweetMetadata): Promise<SendMessageResult>;
  sendPhoto(chatId: number, photo: string, options?: any, metadata?: TweetMetadata): Promise<SendMessageResult>;
};