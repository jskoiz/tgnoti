import { Tweet } from '../../types/twitter.js';

/**
 * Base metadata interface for all events
 */
export interface EventMetadata {
  receivedAt: string;
  source: string;
  [key: string]: any;
}

/**
 * Base interface for all events in the system
 */
export interface TwitterEvent {
  id: string;
  timestamp: Date;
  type: string;
  [key: string]: any; // Keep this for backward compatibility
}

/**
 * Error event
 */
export interface ErrorEvent extends TwitterEvent {
  type: 'error';
  error: Error;
  source: string;
  context?: Record<string, unknown>;
}

/**
 * Raw tweet event - initial event when a tweet is received
 */
export interface TweetEvent extends TwitterEvent {
  type: 'tweet';
  tweet: Tweet;
  topicId: string;
  metadata: EventMetadata;
}

/**
 * Validation metadata
 */
export interface ValidationMetadata {
  validationDurationMs: number;
  isValid?: boolean;
  status?: string;
  reason?: string;
}

/**
 * Validated tweet event - after tweet has been validated
 */
export interface ValidatedTweetEvent extends TwitterEvent {
  type: 'validated_tweet';
  tweet: Tweet;
  topicId: string;
  isValid: boolean;
  validationReason?: string;
  metadata: EventMetadata & {
    validation: ValidationMetadata;
  };
}

/**
 * Filter metadata
 */
export interface FilterMetadata {
  filterDurationMs: number;
  matched?: boolean;
  rules?: string[];
  reason?: string;
  details?: Record<string, unknown>;
  error?: string;
}

/**
 * Filtered tweet event - after tweet has been filtered
 */
export interface FilteredTweetEvent extends TwitterEvent {
  type: 'filtered_tweet';
  tweet: Tweet;
  topicId: string;
  isValid: boolean;
  validationReason?: string;
  matched: boolean;
  rules: string[];
  metadata: EventMetadata & {
    validation: ValidationMetadata;
    filter: FilterMetadata;
  };
}

/**
 * Format metadata
 */
export interface FormatMetadata {
  formatDurationMs: number;
  templateName?: string;
  templateVersion?: string;
  formatOptions?: Record<string, unknown>;
}

/**
 * Formatted tweet event - after tweet has been formatted
 */
export interface FormattedTweetEvent extends TwitterEvent {
  type: 'formatted_tweet';
  tweet: Tweet;
  topicId: string;
  isValid: boolean;
  validationReason?: string;
  matched: boolean;
  rules: string[];
  formattedMessage: string;
  messageButtons?: Array<Array<Record<string, unknown>>>;
  metadata: EventMetadata & {
    validation: ValidationMetadata;
    filter: FilterMetadata;
    format: FormatMetadata;
  };
}

/**
 * Send metadata
 */
export interface SendMetadata {
  sendDurationMs: number;
  queuedAt: string;
  sentAt?: string;
  retryCount?: number;
  deliveryDetails?: Record<string, unknown>;
}

/**
 * Sent tweet event - after tweet has been sent
 */
export interface SentTweetEvent extends TwitterEvent {
  type: 'sent_tweet';
  tweet: Tweet;
  topicId: string;
  isValid: boolean;
  validationReason?: string;
  matched: boolean;
  rules: string[];
  formattedMessage: string;
  messageButtons?: Array<Array<Record<string, unknown>>>;
  messageId: string;
  deliveryStatus: 'queued' | 'sent' | 'failed';
  metadata: EventMetadata & {
    validation: ValidationMetadata;
    filter: FilterMetadata;
    format: FormatMetadata;
    send: SendMetadata;
  };
}