export interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number;
  jitter: boolean;
  maxDelay: number;
}

export interface TelegramConfig {
  defaultTopicId: number;
  api: {
    botToken: string;
    groupId: string;
    retryDelay?: number;
  };
  retry: RetryPolicy;
  queueCheckInterval: number;
  icons: {
    NEW_CONVERSATION: string;
    NEW_MESSAGE: string;
    SYSTEM: string;
    TROJAN: string;
    COMPETITOR: string;
    KOL: string;
  };
  messageOptions: {
    parse_mode: string;
    disable_web_page_preview: boolean;
  };
  topicIds: {
    [key: string]: number;
  };
}
