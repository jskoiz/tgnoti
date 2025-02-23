import { TelegramMessage } from './telegram.js';

export interface StoredMessage extends TelegramMessage {
  timestamp: string;
  topic_id: number;
  raw_format?: {
    entities?: Array<{
      type: string;
      offset: number;
      length: number;
    }>;
    formatting_style?: 'MarkdownV2' | 'HTML' | 'plain';
  };
}

export interface MessageStorage {
  saveMessage(message: StoredMessage): Promise<void>;
  getMessages(topicId: number): Promise<StoredMessage[]>;
  clear(): Promise<void>;
}