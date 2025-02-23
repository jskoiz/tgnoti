import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { MetricsManager } from './MetricsManager.js';
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
  constructor(message: string, context?: Record<string, unknown>) {
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
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {}

  /**
   * Handle any error with proper logging and metrics
   */
  handleError(error: unknown, context?: string): void {
    const errorContext = context ? ` [${context}]` : '';
    
    if (error instanceof AppError) {
      this.logger.error(`${error.code}${errorContext}: ${error.message}`, error.context);
      this.metrics.increment(`errors.${error.code.toLowerCase()}`);
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`UNKNOWN_ERROR${errorContext}: ${errorMessage}`);
      this.metrics.increment('errors.unknown');
    }

    if (error instanceof Error && error.stack) {
      this.logger.debug('Stack trace:', error.stack);
    }
  }

  /**
   * Handle API-specific errors with proper recovery strategies
   */
  handleApiError(error: unknown, apiName: string): void {
    if (error instanceof ApiError) {
      switch (error.statusCode) {
        case 401:
        case 403:
          this.logger.error(`${apiName} authentication failed: ${error.message}`, error.context);
          this.metrics.increment(`api.${apiName.toLowerCase()}.auth_error`);
          process.exit(1);
          break;
          
        case 429:
          this.logger.warn(`${apiName} rate limit exceeded: ${error.message}`, error.context);
          this.metrics.increment(`api.${apiName.toLowerCase()}.rate_limit`);
          break;
          
        case 404:
          this.logger.warn(`${apiName} resource not found: ${error.message}`, error.context);
          this.metrics.increment(`api.${apiName.toLowerCase()}.not_found`);
          break;
          
        default:
          this.logger.error(`${apiName} error (${error.statusCode}): ${error.message}`, error.context);
          this.metrics.increment(`api.${apiName.toLowerCase()}.error`);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`${apiName} unknown error: ${errorMessage}`);
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