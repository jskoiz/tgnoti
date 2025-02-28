import { Logger, LogContext } from '../types/logger.js';

/**
 * LogService interface - Simplified logging API
 * 
 * This interface provides a streamlined logging API with simplified method signatures
 * and support for context management and child loggers. It extends the full Logger
 * interface while providing simplified method signatures for common operations.
 */
export interface LogService extends Logger {
  // Core logging methods with simplified signatures
  info(message: string, data?: Record<string, any>): void;
  warn(message: string, data?: Record<string, any>): void;
  error(message: string, error?: Error, data?: Record<string, any>): void;
  debug(message: string, data?: Record<string, any>): void;
  
  // Context management
  withContext(context: LogContext): Logger;
  
  // Child logger creation
  child(component: string): Logger;
}

/**
 * Log levels enum
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

/**
 * Log entry structure for standardized logging
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  correlationId?: string;
  message: string;
  data?: Record<string, any>;
  error?: LogErrorInfo;
}

/**
 * Standardized error information structure
 */
export interface LogErrorInfo {
  name?: string;
  message: string;
  stack?: string;
  code?: string | number;
}