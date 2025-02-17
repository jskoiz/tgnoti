export interface FormattedMessage {
  text?: string;
  caption?: string;
  photo?: string;
  parse_mode?: 'MarkdownV2' | 'HTML';
  message_thread_id?: number;
  disable_web_page_preview?: boolean;
}

export interface TelegramBotConfig {
  botToken: string;
  groupId: string;
  retryAttempts: number;
  defaultTopicId: string;
}

export interface TopicConfig {
  id: string;
  fallbackId: string | null;
  isRequired: boolean;
  description: string;
}

export const TOPIC_CONFIG: { [key: string]: TopicConfig } = {
  TROJAN: {
    id: '381',
    fallbackId: '377',
    isRequired: true,
    description: 'Trojan Monitor'
  },
  COMPETITOR: {
    id: '377',
    fallbackId: '885',
    isRequired: true,
    description: 'Competitor Monitor'
  },
  GENERAL: {
    id: '885',
    fallbackId: null,
    isRequired: false,
    description: 'General Discussion'
  }
};

export enum TelegramErrorType {
  FORMATTING = 'FORMATTING',
  TOPIC_ACCESS = 'TOPIC_ACCESS',
  NETWORK = 'NETWORK',
  AUTHENTICATION = 'AUTHENTICATION',
  UNKNOWN = 'UNKNOWN'
}

export interface ErrorHandler {
  type: TelegramErrorType;
  canRetry: boolean;
  needsFallback: boolean;
  handler: (error: Error) => Promise<void>;
}

export interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  entities?: Array<{
    type: string;
    offset: number;
    length: number;
  }>;
}