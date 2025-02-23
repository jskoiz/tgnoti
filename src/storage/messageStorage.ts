import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { StoredMessage, MessageStorage } from '../types/messageStorage.js';
import fs from 'fs/promises';
import path from 'path';

@injectable()
export class FileMessageStorage implements MessageStorage {
  private readonly storageFile: string;

  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {
    this.storageFile = 'topic_5026_messages.json';
  }

  async saveMessage(message: StoredMessage): Promise<void> {
    try {
      let messages: StoredMessage[] = [];
      
      try {
        const content = await fs.readFile(this.storageFile, 'utf-8');
        messages = JSON.parse(content);
      } catch (error) {
        // File doesn't exist or is invalid, start with empty array
        this.logger.debug('Creating new message storage file');
      }

      messages.push(message);
      
      await fs.writeFile(
        this.storageFile,
        JSON.stringify(messages, null, 2),
        'utf-8'
      );
      
      this.logger.debug(`Saved message ${message.message_id} to storage`);
    } catch (error) {
      this.logger.error('Failed to save message:', error as Error);
      throw error;
    }
  }

  async getMessages(topicId: number): Promise<StoredMessage[]> {
    try {
      const content = await fs.readFile(this.storageFile, 'utf-8');
      const messages: StoredMessage[] = JSON.parse(content);
      return messages.filter(msg => msg.topic_id === topicId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // File doesn't exist yet
        return [];
      }
      this.logger.error('Failed to read messages:', error as Error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.writeFile(this.storageFile, '[]', 'utf-8');
      this.logger.debug('Cleared message storage');
    } catch (error) {
      this.logger.error('Failed to clear messages:', error as Error);
      throw error;
    }
  }
}