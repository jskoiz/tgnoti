import { injectable } from 'inversify';
import { Logger } from '../types/logger.js';

@injectable()
export class ConsoleLogger implements Logger {
  info(message: string): void {
    console.log(`[INFO] ${message}`);
  }

  warn(message: string, error?: Error): void {
    if (error) {
      console.warn(`[WARN] ${message}`, error);
    } else {
      console.warn(`[WARN] ${message}`);
    }
  }

  error(message: string, error?: Error): void {
    if (error) {
      console.error(`[ERROR] ${message}`, error);
    } else {
      console.error(`[ERROR] ${message}`);
    }
  }

  debug(message: string): void {
    console.debug(`[DEBUG] ${message}`);
  }
}

// Export the Logger type
export type { Logger };
