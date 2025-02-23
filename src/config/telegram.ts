import { RetryPolicy, DEFAULT_RETRY_POLICY } from './retry.js';
import { monitoringConfig } from './monitoring.js';

/**
 * Message formatting options
 */
export interface MessageOptions {
  parse_mode: 'HTML';
  disable_web_page_preview: boolean;
}

/**
 * Topic icons configuration
 */
export interface TopicIcons {
  NEW_CONVERSATION: string;
  NEW_MESSAGE: string;
  SYSTEM: string;
  TROJAN: string;
  COMPETITOR: string;
  KOL: string;
}

/**
 * Telegram API configuration
 */
export interface TelegramApiConfig {
  botToken: string;
  groupId: string;
}

/**
 * Complete Telegram configuration
 */
export interface TelegramConfig {
  defaultTopicId: number;
  api: TelegramApiConfig;
  retry: RetryPolicy;
  queueCheckInterval: number;
  icons: TopicIcons;
  messageOptions: MessageOptions;
  topicIds: {
    TROJAN: number;
    COMPETITOR: number;
    KOL: number;
  };
}

/**
 * Default Telegram configuration
 */
export const telegramConfig: TelegramConfig = {
  defaultTopicId: monitoringConfig.topics.trojan.id,
  api: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    groupId: process.env.TELEGRAM_GROUP_ID || ''
  },
  retry: {
    ...DEFAULT_RETRY_POLICY,
    maxAttempts: 5,
    baseDelay: 5000, // 5 seconds between messages
    maxDelay: 30000  // 30 seconds max delay
  },
  queueCheckInterval: 30000, // 30 seconds
  icons: {
    NEW_CONVERSATION: '🆕',
    NEW_MESSAGE: '💬',
    SYSTEM: '🤖',
    TROJAN: '🔍',
    COMPETITOR: '👀',
    KOL: '🌟'
  },
  messageOptions: {
    parse_mode: 'HTML',
    disable_web_page_preview: true
  },
  topicIds: {
    TROJAN: monitoringConfig.topics.trojan.id,
    COMPETITOR: monitoringConfig.topics.competitor.id,
    KOL: monitoringConfig.topics.kol.id
  }
};

/**
 * Get icon for a specific topic
 */
export function getTopicIcon(topicId: number): string {
  switch (topicId) {
    case telegramConfig.topicIds.TROJAN:
      return telegramConfig.icons.TROJAN;
    case telegramConfig.topicIds.COMPETITOR:
      return telegramConfig.icons.COMPETITOR;
    case telegramConfig.topicIds.KOL:
      return telegramConfig.icons.KOL;
    default:
      return telegramConfig.icons.SYSTEM;
  }
}
