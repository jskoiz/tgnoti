import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';

@injectable()
export class Sanitizer {
  constructor(@inject(TYPES.Logger) private logger: Logger) {}

  sanitizeMarkdown(text: string): string {
    try {
      return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
    } catch (error) {
      this.logger.warn('Failed to sanitize markdown', error as Error);
      return text;
    }
  }

  sanitizeHtml(text: string): string {
    try {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    } catch (error) {
      this.logger.warn('Failed to sanitize HTML', error as Error);
      return text;
    }
  }

  sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.toString();
    } catch (error) {
      this.logger.warn('Failed to sanitize URL', error as Error);
      return '';
    }
  }
}