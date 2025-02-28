import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { StoredMessage, MessageStorage } from '../types/messageStorage.js';
import fs from 'fs/promises';
import path from 'path';

@injectable()
export class FileMessageStorage implements MessageStorage {
  private storagePath: string;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.BasePath) basePath: string
  ) {
    this.storagePath = path.join(basePath, 'messages.json');
  }

  async saveMessage(message: StoredMessage): Promise<void> {
    try {
      const messages = await this.readMessages();
      messages.push(message);
      await this.writeMessages(messages);
      this.logger.debug(`Saved message ${message.id} to storage`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to save message:', err);
      throw err;
    }
  }

  async getMessage(id: string): Promise<StoredMessage | null> {
    try {
      const messages = await this.readMessages();
      return messages.find(msg => msg.id === id) || null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get message:', err);
      throw err;
    }
  }

  async getMessages(): Promise<StoredMessage[]> {
    try {
      return await this.readMessages();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get messages:', err);
      throw err;
    }
  }

  async updateMessage(id: string, updates: Partial<StoredMessage>): Promise<void> {
    try {
      const messages = await this.readMessages();
      const index = messages.findIndex(msg => msg.id === id);
      if (index === -1) {
        throw new Error(`Message ${id} not found`);
      }
      messages[index] = { ...messages[index], ...updates };
      await this.writeMessages(messages);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to update message:', err);
      throw err;
    }
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      const messages = await this.readMessages();
      const filteredMessages = messages.filter(msg => msg.id !== id);
      await this.writeMessages(filteredMessages);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to delete message:', err);
      throw err;
    }
  }

  async getPendingMessages(): Promise<StoredMessage[]> {
    try {
      const messages = await this.readMessages();
      return messages.filter(msg => msg.threadId === 5026);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to get pending messages:', err);
      throw err;
    }
  }

  async cleanup(maxAge: number): Promise<void> {
    try {
      const messages = await this.readMessages();
      const now = new Date();
      const filteredMessages = messages.filter(msg => {
        const messageDate = new Date(msg.timestamp);
        const ageInMs = now.getTime() - messageDate.getTime();
        return ageInMs <= maxAge;
      });
      await this.writeMessages(filteredMessages);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to cleanup messages:', err);
      throw err;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.writeMessages([]);
      this.logger.debug('Cleared all messages from storage');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to clear messages:', err);
      throw err;
    }
  }

  private async readMessages(): Promise<StoredMessage[]> {
    try {
      const content = await fs.readFile(this.storagePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeMessages(messages: StoredMessage[]): Promise<void> {
    await fs.writeFile(this.storagePath, JSON.stringify(messages, null, 2));
  }
}