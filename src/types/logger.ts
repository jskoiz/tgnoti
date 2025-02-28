export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LogContext {
  component?: string;  // Made optional for backward compatibility
  correlationId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  correlationId?: string;
  message: string;
  data?: Record<string, any>;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
}

export interface LogAggregator {
  count: number;
  lastLog: number;
  window: number;
}

export interface Logger {
  info(message: string, context?: LogContext): void;
  warn(message: string, error?: Error, context?: LogContext): void;
  error(message: string, error?: Error, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  setLevel(level: LogLevel): void;
  setComponent(component: string): void;
  logObject(level: string, message: string, obj: any, context?: LogContext): void;
  
  // New methods for structured logging
  logStructured(entry: LogEntry): void;
  withContext(context: LogContext): Logger;

  // Child logger support
  child(component: string): Logger;
  
  // Aggregation support
  shouldLog(level: LogLevel, aggregator?: LogAggregator): boolean;
  updateAggregator(aggregator: LogAggregator): void;
}