import { LogService, LogLevel, LogEntry, LogErrorInfo } from './LogService.js';
import { LogTransport } from './transports/LogTransport.js';
import { CorrelationContext } from './CorrelationContext.js';
import { Logger, LogContext, LogAggregator } from '../types/logger.js';

/**
 * DefaultLogService - Implementation of the Logger interface
 * 
 * This class provides a standard implementation of the Logger interface
 * with support for multiple transports, context management, and child loggers.
 */
export class DefaultLogService implements Logger {
  /**
   * Create a new DefaultLogService
   * 
   * @param component The component name
   * @param level The log level
   * @param transports The log transports
   * @param contextData Additional context data
   */
  constructor(
    private component: string,
    private level: LogLevel,
    private transports: LogTransport[],
    private contextData: Record<string, any> = {}
  ) {}
  
  /**
   * Log an informational message
   * 
   * @param message The message to log
   * @param context Additional context to include
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, undefined, context);
  }
  
  /**
   * Log a warning message
   * 
   * @param message The message to log
   * @param error Optional error object
   * @param context Additional context to include
   */
  warn(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.WARN, message, error, context);
  }
  
  /**
   * Log an error message
   * 
   * @param message The message to log
   * @param error Optional error object
   * @param context Additional context to include
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, error, context);
  }
  
  /**
   * Log a debug message
   * 
   * @param message The message to log
   * @param context Additional context to include
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, undefined, context);
  }
  
  /**
   * Create a new logger with additional context
   * 
   * @param context The context to add
   * @returns A new Logger with the combined context
   */
  withContext(context: LogContext): Logger {
    return new DefaultLogService(
      this.component,
      this.level,
      this.transports,
      { ...this.contextData, ...context }
    );
  }
  
  /**
   * Create a child logger for a different component
   * 
   * @param component The component name
   * @returns A new Logger for the specified component
   */
  child(component: string): Logger {
    return new DefaultLogService(
      component,
      this.level,
      this.transports,
      this.contextData
    );
  }
  
  /**
   * Set the log level
   * 
   * @param level The new log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Set the component name
   * 
   * @param component The new component name
   */
  setComponent(component: string): void {
    this.component = component;
  }

  /**
   * Log an object with the specified level
   * 
   * @param level The log level as a string
   * @param message The message to log
   * @param obj The object to log
   * @param context Additional context to include
   * @returns void
   */
  logObject(level: string, message: string, obj: any, context?: LogContext): void {
    this.log(LogLevel[level as keyof typeof LogLevel], message, undefined, { ...context, object: obj });
  }

  /**
   * Log a structured entry
   * 
   * @param entry The structured log entry to record
   * @returns void
   */
  logStructured(entry: LogEntry): void {
    for (const transport of this.transports) {
      transport.log(entry);
    }
  }
  
  /**
   * Check if a message should be logged based on level and aggregation rules
   * 
   * @param level The log level to check
   * @param aggregator Optional aggregator for rate limiting
   * @returns boolean indicating if the message should be logged
   */
  shouldLog(level: LogLevel, aggregator?: LogAggregator): boolean {
    return level <= this.level;
  }

  /**
   * Update the aggregator state after logging
   * This can be used to implement rate limiting or other aggregation logic
   * 
   * @param aggregator The aggregator to update
   * @returns void
   */
  updateAggregator(aggregator: LogAggregator): void {
    // Implementation can be added based on requirements
  }
  
  /**
   * Log a message with the specified level
   * 
   * @param level The log level
   * @param message The message to log
   * @param error The error object (optional)
   * @param context Additional context to include (optional)
   */
  private log(level: LogLevel, message: string, error?: Error, context?: LogContext): void {
    // Skip if the log level is higher than the configured level
    if (level > this.level) return;
    
    // Create the log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      data: { ...this.contextData, ...(context || {}) },
      correlationId: CorrelationContext.get('correlationId'),
      error: error ? this.formatError(error) : undefined
    };
    
    // Send to all transports
    for (const transport of this.transports) {
      transport.log(entry);
    }
  }
  
  /**
   * Format an error object for logging
   * 
   * @param error The error to format
   * @returns A structured error object
   */
  private formatError(error: Error): LogErrorInfo {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    };
  }
}