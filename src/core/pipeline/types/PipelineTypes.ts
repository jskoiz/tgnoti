import { Tweet } from '../../../types/twitter.js';
import { TelegramQueueMetrics } from '../../../types/telegram.js';

/**
 * Represents the result of a pipeline stage execution
 */
export interface StageResult<T> {
  success: boolean;
  data: T;
  error?: Error;
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all pipeline stages
 */
export interface PipelineStage<Input, Output> {
  name: string;
  execute(input: Input): Promise<StageResult<Output>>;
}

/**
 * Stage-specific metadata types
 */
export interface SendStageMetadata {
  formattedMessage?: string;
  messageButtons?: any[][];
  sendDurationMs?: number;
  queueMessageId?: string;
  queueStatus?: {
    position: number;
    isProcessing: boolean;
    isPaused: boolean;
  };
  queueMetrics?: TelegramQueueMetrics;
  errorType?: string;
  errorMessage?: string;
  retryAttempt?: number;
  nextRetryTime?: Date | undefined;
}

export interface StageMetadata {
  send?: SendStageMetadata;
  skipped?: boolean;
  message?: string;
  reason?: string;
  errorType?: string;
  errorMessage?: string;
  validationDurationMs?: number;
  validation?: {
    isValid: boolean;
    status: 'pending' | 'success' | 'failed' | 'skipped' | 'error';
    reason?: string;
    details?: Record<string, unknown>;
    storage?: {
      storedInMongoDB: boolean;
      storageError?: string;
      storageDurationMs?: number;
    };
  };
  fetch?: {
    fetchDurationMs?: number;
    skippedFetch?: boolean;
    searchWindow?: {
      startDate: string;
      endDate: string;
    };
  };
  filter?: {
    matched: boolean;
    rules: string[];
    filterDurationMs?: number;
  };
  format?: {
    formatDurationMs?: number;
    formattedMessage?: string;
    mediaAttachments?: Array<{
      type: 'photo' | 'video' | 'gif';
      url: string;
    }>;
    messageButtons?: any[][];
    messageLength?: number;
    hasMedia?: boolean;
  };
}

/**
 * Tweet processing context passed between stages
 */
export interface TweetContext {
  tweet: Tweet;
  topicId: string;
  processed: boolean;
  validated: boolean;
  filtered: boolean;
  formatted: boolean;
  sent: boolean;
  error?: Error;
  metadata: StageMetadata;
}

/**
 * Configuration for the tweet processing pipeline
 */
export interface PipelineConfig {
  enableValidation: boolean;
  enableFiltering: boolean;
  enableFormatting: boolean;
  retryCount: number;
  timeoutMs: number;
}

/**
 * Result of the entire pipeline execution
 */
export interface PipelineResult {
  success: boolean;
  context: TweetContext;
  error?: Error;
  processingTimeMs: number;
  stageResults: {
    [stageName: string]: StageResult<unknown>;
  };
}