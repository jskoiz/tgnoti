import { ErrorHandler, AppError, ValidationError, ApiError, RateLimitError, AuthError, StorageError, ErrorCodes } from '../src/utils/ErrorHandler.js';
import { Logger } from '../src/types/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';

// Mock Logger
class MockLogger implements Logger {
  public logs: { level: string; message: string; args: any[] }[] = [];

  info(message: string, ...args: any[]): void {
    this.logs.push({ level: 'info', message, args });
  }

  warn(message: string, error?: Error | Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, args: [error] });
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, args: [error] });
  }

  debug(message: string, ...args: any[]): void {
    this.logs.push({ level: 'debug', message, args });
  }
}

// Mock MetricsManager
class MockMetricsManager extends MetricsManager {
  constructor() {
    super(new MockLogger());
  }

  // Override methods to remove logging
  increment(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue + value);
  }

  decrement(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue - value);
  }

  gauge(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }

  timing(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }

  reset(metric: string): void {
    this.metrics.delete(metric);
  }

  resetAll(): void {
    this.metrics.clear();
  }
}

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: MockLogger;
  let mockMetrics: MockMetricsManager;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockMetrics = new MockMetricsManager();
    errorHandler = new ErrorHandler(mockLogger, mockMetrics);
  });

  describe('handleError', () => {
    it('should handle AppError with context', () => {
      const context = { userId: '123' };
      const error = new ValidationError('Invalid input', context);
      
      errorHandler.handleError(error);

      expect(mockLogger.logs).toHaveLength(1);
      expect(mockLogger.logs[0]).toEqual({
        level: 'error',
        message: 'VALIDATION_ERROR: Invalid input',
        args: [context]
      });
      expect(mockMetrics.getValue('errors.validation_error')).toBe(1);
    });

    it('should handle unknown errors', () => {
      const error = new Error('Something went wrong');
      
      errorHandler.handleError(error);

      expect(mockLogger.logs).toHaveLength(2); // Error + stack trace
      expect(mockLogger.logs[0]).toEqual({
        level: 'error',
        message: 'UNKNOWN_ERROR: Something went wrong',
        args: []
      });
      expect(mockMetrics.getValue('errors.unknown')).toBe(1);
    });

    it('should include context in error message', () => {
      const error = new Error('Process failed');
      
      errorHandler.handleError(error, 'UserService');

      expect(mockLogger.logs[0]).toEqual({
        level: 'error',
        message: 'UNKNOWN_ERROR [UserService]: Process failed',
        args: []
      });
    });
  });

  describe('handleApiError', () => {
    it('should handle authentication errors', () => {
      const error = new AuthError('Invalid token');
      
      expect(() => {
        errorHandler.handleApiError(error, 'Twitter');
      }).toThrow(); // Should exit process

      expect(mockLogger.logs[0]).toEqual({
        level: 'error',
        message: 'Twitter authentication failed: Invalid token',
        args: [undefined]
      });
      expect(mockMetrics.getValue('api.twitter.auth_error')).toBe(1);
    });

    it('should handle rate limit errors', () => {
      const context = { reset: 3600 };
      const error = new RateLimitError('Too many requests', context);
      
      errorHandler.handleApiError(error, 'Twitter');

      expect(mockLogger.logs[0]).toEqual({
        level: 'warn',
        message: 'Twitter rate limit exceeded: Too many requests',
        args: [context]
      });
      expect(mockMetrics.getValue('api.twitter.rate_limit')).toBe(1);
    });

    it('should handle 404 errors', () => {
      const error = new ApiError(404, 'Tweet not found');
      
      errorHandler.handleApiError(error, 'Twitter');

      expect(mockLogger.logs[0]).toEqual({
        level: 'warn',
        message: 'Twitter resource not found: Tweet not found',
        args: [undefined]
      });
      expect(mockMetrics.getValue('api.twitter.not_found')).toBe(1);
    });
  });

  describe('error creation methods', () => {
    it('should create validation error', () => {
      const context = { field: 'email' };
      const error = errorHandler.createValidationError('Invalid email', context);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe('Invalid email');
      expect(error.context).toEqual(context);
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should create API error', () => {
      const context = { endpoint: '/users' };
      const error = errorHandler.createApiError(500, 'Server error', context);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Server error');
      expect(error.context).toEqual(context);
      expect(error.statusCode).toBe(500);
    });

    it('should create storage error', () => {
      const context = { operation: 'write' };
      const error = errorHandler.createStorageError('Write failed', context);

      expect(error).toBeInstanceOf(StorageError);
      expect(error.message).toBe('Write failed');
      expect(error.context).toEqual(context);
      expect(error.code).toBe('STORAGE_ERROR');
    });
  });

  describe('ErrorCodes', () => {
    it('should have all required error codes', () => {
      expect(ErrorCodes.VALIDATION.INVALID_CONFIG).toBe('INVALID_CONFIG');
      expect(ErrorCodes.API.RATE_LIMIT).toBe('RATE_LIMIT');
      expect(ErrorCodes.SYSTEM.RUNTIME).toBe('RUNTIME_ERROR');
    });
  });
});