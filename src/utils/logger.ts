import { injectable, inject } from 'inversify';
import { Logger, LogLevel, LogContext, LogEntry, LogAggregator } from '../types/logger.js';
import { LoggingConfig } from '../config/loggingConfig.js';
import { TYPES } from '../types/di.js';

@injectable()
export class ConsoleLogger implements Logger {
  private level: LogLevel = LogLevel.INFO;
  private component: string = 'default';
  private aggregators: Map<string, LogAggregator> = new Map();

  constructor(
    @inject(TYPES.LoggingConfig) private config: LoggingConfig
  ) {}

  private formatTime(): string {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
  }

  private formatError(error: Error): LogEntry['error'] {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    };
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    return {
      timestamp: this.formatTime(),
      level,
      component: context?.component || this.component,
      correlationId: context?.correlationId,
      message,
      data: context ? this.sanitizeContext(context) : undefined,
      error: error ? this.formatError(error) : undefined
    };
  }

  private sanitizeContext(context: LogContext): Record<string, any> {
    const { component, correlationId, ...rest } = context;
    return Object.entries(rest)
      .filter(([_, v]) => v !== undefined)
      .reduce((acc, [k, v]) => ({
        ...acc,
        [k]: this.sanitizeValue(v)
      }), {});
  }

  private sanitizeValue(value: any): any {
    if (value === undefined) return undefined;
    if (value === null) return undefined;
    if (value instanceof Error) return this.formatError(value);
    if (typeof value === 'object') {
      return Object.entries(value)
        .filter(([_, v]) => v !== undefined)
        .reduce((acc, [k, v]) => ({
          ...acc,
          [k]: this.sanitizeValue(v)
        }), {});
    }
    return value;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setComponent(component: string): void {
    this.component = component;
    // Update log level based on component config
    this.level = this.config.getLogLevel(component);
  }

  shouldLog(level: LogLevel, aggregator?: LogAggregator): boolean {
    if (level > this.level) return false;
    
    if (aggregator) {
      const now = Date.now();
      if (now - aggregator.lastLog < aggregator.window) {
        aggregator.count++;
        return false;
      }
      return true;
    }
    
    return true;
  }

  updateAggregator(aggregator: LogAggregator): void {
    aggregator.lastLog = Date.now();
    aggregator.count = 0;
  }

  logStructured(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${entry.component}]${entry.correlationId ? ` [${entry.correlationId}]` : ''}`;
    
    let message = `${prefix} ${entry.message}`;
    
    if (entry.data) {
      message += ` ${JSON.stringify(entry.data)}`;
    }
    
    // Filter out undefined values from the message
    message = message.replace(/['"]\w+['"]:\s*undefined,?/g, '');
    
    if (entry.error) {
      message += ` Error: ${entry.error.message}`;
      if (entry.error.code) {
        message += ` (${entry.error.code})`;
      }
    }

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(message);
        break;
      case LogLevel.WARN:
        console.warn(message);
        break;
      case LogLevel.DEBUG:
        console.debug(message);
        break;
      default:
        console.log(message);
    }
  }

  withContext(context: LogContext): Logger {
    const childLogger = new ConsoleLogger(this.config);
    childLogger.setLevel(this.level);
    childLogger.setComponent(context.component || this.component);
    return childLogger;
  }

  child(component: string): Logger {
    const childLogger = new ConsoleLogger(this.config);
    childLogger.setLevel(this.level);
    childLogger.setComponent(component);
    return childLogger;
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    this.logStructured(this.createLogEntry(LogLevel.INFO, message, context));
  }

  warn(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    this.logStructured(this.createLogEntry(LogLevel.WARN, message, context, error));
  }

  error(message: string, error?: Error, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    this.logStructured(this.createLogEntry(LogLevel.ERROR, message, context, error));
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    this.logStructured(this.createLogEntry(LogLevel.DEBUG, message, context));
  }

  logObject(level: string, message: string, obj: any, context?: LogContext): void {
    const logLevel = (LogLevel as any)[level.toUpperCase()] || LogLevel.INFO;
    if (!this.shouldLog(logLevel)) return;
    
    const sanitizedObj = this.sanitizeValue(obj);
    const enhancedContext = {
      ...context,
      data: sanitizedObj
    };
    
    this.logStructured(this.createLogEntry(logLevel, message, enhancedContext));
  }
}
