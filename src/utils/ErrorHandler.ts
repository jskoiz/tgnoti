import { injectable, inject } from 'inversify';
import { LogService } from '../logging/LogService.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { TYPES } from '../types/di.js';

// Base error class for all application errors
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation related errors
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, context);
  }
}

// Configuration related errors
export class ConfigError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('CONFIG_ERROR', message, context);
  }
}

// API related errors
export class ApiError extends AppError {
  constructor(
    public statusCode: number,
    message: string,
    context?: Record<string, unknown>
  ) {
    super('API_ERROR', message, context);
  }
}

// Rate limiting errors
export class RateLimitError extends ApiError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(429, message, context);
  }
}

// Authentication errors
export class AuthError extends ApiError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(401, message, context);
  }
}

// Data storage errors
export class StorageError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super('STORAGE_ERROR', message, context);
  }
}

// Error codes mapping
export const ErrorCodes = {
  VALIDATION: {
    INVALID_CONFIG: 'INVALID_CONFIG',
    INVALID_DATE: 'INVALID_DATE',
    INVALID_SEARCH: 'INVALID_SEARCH',
    MISSING_FIELD: 'MISSING_FIELD'
  },
  API: {
    RATE_LIMIT: 'RATE_LIMIT',
    AUTH_FAILED: 'AUTH_FAILED',
    NOT_FOUND: 'NOT_FOUND',
    SERVER_ERROR: 'SERVER_ERROR'
  },
  SYSTEM: {
    INITIALIZATION: 'INIT_ERROR',
    RUNTIME: 'RUNTIME_ERROR',
    STORAGE: 'STORAGE_ERROR'
  }
} as const;

@injectable()
export class ErrorHandler {
  constructor(
    @inject(TYPES.LogService) private logService: LogService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {}

  /**
   * Handle any error with proper logging and metrics
   */
  handleError(error: unknown, context?: string): void {
    const component = context || 'unknown';
    const logger = this.logService.child(component);
    
    if (error instanceof AppError) {
      logger.error(error.message, error, { 
        code: error.code,
        context: error.context
      });
      this.metrics.increment(`errors.${error.code.toLowerCase()}`);
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(errorMessage, error instanceof Error ? error : undefined);
      this.metrics.increment('errors.unknown');
    }
  }

  /**
   * Handle API-specific errors with proper recovery strategies
   */
  handleApiError(error: unknown, apiName: string): void {
    const logger = this.logService.child(apiName);
    
    if (error instanceof ApiError) {
      switch (error.statusCode) {
        case 401:
        case 403:
          logger.error(`Authentication failed: ${error.message}`, error, { 
            context: error.context,
            statusCode: error.statusCode
          });
          this.metrics.increment(`api.${apiName.toLowerCase()}.auth_error`);
          process.exit(1);
          break;
          
        case 429:
          logger.warn(
            `Rate limit exceeded: ${error.message}`,
            error,
            {
              statusCode: error.statusCode,
              ...(error.context && { context: error.context })
            }
          );
          this.metrics.increment(`api.${apiName.toLowerCase()}.rate_limit`);
          break;
          
        case 404:
          logger.warn(`Resource not found: ${error.message}`, error, {
            statusCode: error.statusCode,
            ...(error.context && { context: error.context })
          });
          this.metrics.increment(`api.${apiName.toLowerCase()}.not_found`);
          break;
          
        default:
          logger.error(`API error (${error.statusCode}): ${error.message}`, error, { 
            context: error.context,
            statusCode: error.statusCode
          });
          this.metrics.increment(`api.${apiName.toLowerCase()}.error`);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Unknown error: ${errorMessage}`, error instanceof Error ? error : undefined);
      this.metrics.increment(`api.${apiName.toLowerCase()}.unknown`);
    }
  }

  /**
   * Create a validation error with proper context
   */
  createValidationError(message: string, context?: Record<string, unknown>): ValidationError {
    return new ValidationError(message, context);
  }

  /**
   * Create an API error with proper status code and context
   */
  createApiError(statusCode: number, message: string, context?: Record<string, unknown>): ApiError {
    return new ApiError(statusCode, message, context);
  }

  /**
   * Create a configuration error with proper context
   */
  createConfigError(message: string, context?: Record<string, unknown>): ConfigError {
    return new ConfigError(message, context);
  }

  /**
   * Create a storage error with proper context
   */
  createStorageError(message: string, context?: Record<string, unknown>): StorageError {
    return new StorageError(message, context);
  }
}