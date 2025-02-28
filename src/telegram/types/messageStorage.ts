export interface StoredMessage {
  id: string;
  chatId: number;
  threadId?: number;
  messageId?: number;
  content: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'failed';
  retryCount: number;
  error?: string;
}

export interface MessageStorage {
  saveMessage(message: StoredMessage): Promise<void>;
  getMessage(id: string): Promise<StoredMessage | null>;
  updateMessage(id: string, updates: Partial<StoredMessage>): Promise<void>;
  deleteMessage(id: string): Promise<void>;
  getPendingMessages(): Promise<StoredMessage[]>;
  cleanup(maxAge: number): Promise<void>;
  getMessages(): Promise<StoredMessage[]>;
  clear(): Promise<void>;
}