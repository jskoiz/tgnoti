import { monitoringConfig } from './monitoring.js';

export const TELEGRAM_CONFIG = {
  // Default topic settings
  DEFAULT_TOPIC_ID: monitoringConfig.topics.trojan.id,
  
  // Retry settings
  MAX_RETRIES: 5,
  RETRY_DELAY: 5000, // 5 seconds between messages
  QUEUE_CHECK_INTERVAL: 30000, // 30 seconds
  
  // Message icons
  ICONS: {
    NEW_CONVERSATION: '🆕',
    NEW_MESSAGE: '💬',
    SYSTEM: '🤖',
    TROJAN: '🔍',
    COMPETITOR: '👀',
    KOL: '🌟'
  },

  // Message options
  MESSAGE_OPTIONS: {
    parse_mode: 'HTML' as const,
    disable_web_page_preview: true
  },

  // Topic settings
  TOPICS: {
    TROJAN: monitoringConfig.topics.trojan.id,
    COMPETITOR: monitoringConfig.topics.competitor.id,
    KOL: monitoringConfig.topics.kol.id
  }
};
