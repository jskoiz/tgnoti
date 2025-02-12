import { injectable } from 'inversify';
import { Logger } from '../types/logger.js';

@injectable()
export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  warn(message: string, error?: Error): void {
    console.warn(`[WARN] ${message}`, error || '');
  }

  error(message: string, error?: Error): void {
    console.error(`[ERROR] ${message}`, error || '');
  }

  debug(message: string): void {
    console.debug(`[DEBUG] ${message}`);
  }
}

// Export the Logger type
export type { Logger };
