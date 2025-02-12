export interface FormattedMessage {
  text?: string;
  photo?: string;
  caption?: string;
  parse_mode: 'HTML' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  message_thread_id?: number;
}

export interface TelegramBotConfig {
  botToken: string;
  groupId: string;
  defaultTopicId: string;
  retryAttempts: number;
}

export interface TelegramMessage {
  message_id: number;
  message_thread_id?: number;
  text?: string;
  from?: {
    id: number;
    username?: string;
  };
}