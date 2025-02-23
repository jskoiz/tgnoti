import { TopicConfig } from '../types/telegram.js';

/**
 * Static topic configuration
 * Only add topics that need special handling or are required for the system
 */
export const TOPIC_CONFIG: Record<string, TopicConfig> = {
  GENERAL: {
    id: "1",
    name: "General",
    isRequired: true
  },
  "5572": {
    id: "5572",
    name: "TradeWithPhoton Monitoring",
    isRequired: true
  }
};

/**
 * Get human-readable topic name
 */
export function getTopicName(topicId: string): string {
  return `Topic ${topicId}`;
}