import { injectable } from 'inversify';
import { Logger } from '../types/logger.js';

@injectable()
export class ErrorHandler {
  constructor(private logger: Logger) {}

  handleError(error: Error, context?: string): void {
    const errorContext = context ? ` [${context}]` : '';
    this.logger.error(`Error${errorContext}: ${error.message}`);
    
    if (error.stack) {
      this.logger.debug(`Stack trace: ${error.stack}`);
    }
  }

  handleApiError(error: unknown, apiName: string): void {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.toLowerCase().includes('401') || 
        errorMessage.toLowerCase().includes('403')) {
      this.logger.error(`${apiName} authentication error: ${errorMessage}`);
      process.exit(1);
    }

    if (errorMessage.toLowerCase().includes('429') || 
        errorMessage.toLowerCase().includes('rate limit')) {
      this.logger.error(`${apiName} rate limit exceeded: ${errorMessage}`);
      return;
    }

    this.logger.error(`${apiName} error: ${errorMessage}`);
  }
}