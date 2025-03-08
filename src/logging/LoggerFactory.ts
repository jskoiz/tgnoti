import { injectable } from 'inversify';
import { LogLevel, LogService } from './LogService.js';
import { DefaultLogService } from './DefaultLogService.js';
import { LogTransport, ConsoleTransport, FileTransport, HttpTransport } from './transports/LogTransport.js';

/**
 * Logging configuration interface
 */
export interface LoggingConfig {
  // Default log level for all components
  defaultLevel: LogLevel;
  
  // Component-specific log levels
  componentLevels?: Record<string, LogLevel>;
  
  // File logging configuration
  fileLogging?: {
    enabled: boolean;
    path: string;
    maxSize?: string;
    maxFiles?: number;
    format?: 'json' | 'text';
  };
  
  // HTTP logging configuration
  httpLogging?: {
    enabled: boolean;
    url: string;
    batchSize?: number;
    flushInterval?: number;
    headers?: Record<string, string>;
  };
  
  // Format configuration
  format?: 'json' | 'text';
  
  // Additional metadata to include in all logs
  globalMetadata?: Record<string, any>;
}

/**
 * LoggerFactory - Singleton factory for creating and configuring loggers
 * 
 * This class is responsible for creating and configuring logger instances
 * based on the provided configuration.
 */
@injectable()
export class LoggerFactory {
  private static instance: LoggerFactory;
  private quietMode: boolean = false;
  private config: LoggingConfig = {
    defaultLevel: LogLevel.INFO,
    format: 'text',
    componentLevels: {
      'DuplicateCheckStage': LogLevel.INFO,
      'FilterStage': LogLevel.INFO,
      'ValidationStage': LogLevel.INFO,
      'TweetProcessor': LogLevel.DEBUG,
      'SearchConfig': LogLevel.INFO,
      'SearchStrategy': LogLevel.INFO,
      'TwitterNotifier': LogLevel.DEBUG,
      'RateLimitedQueue': LogLevel.DEBUG,
      'TwitterClient': LogLevel.DEBUG,
      'TelegramMessageSender': LogLevel.DEBUG,
      'TelegramMessageQueue': LogLevel.DEBUG,
      'MongoDBManager': LogLevel.INFO,
      'ConfigManager': LogLevel.INFO
    },
    globalMetadata: {
      app: 'twitter-notifier',
      environment: process.env.NODE_ENV || 'development'
    }
  };
  private transports: LogTransport[] = [];
  
  /**
   * Get the singleton instance of LoggerFactory
   * 
   * @returns The LoggerFactory instance
   */
  static getInstance(): LoggerFactory {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new LoggerFactory();
    }
    return LoggerFactory.instance;
  }
  
  /**
   * Configure the LoggerFactory with the provided configuration
   * 
   * @param config The logging configuration
   */
  configure(config: LoggingConfig): void {
    // Merge component levels
    const componentLevels = { ...this.config.componentLevels, ...config.componentLevels };
    
    this.config = {
      ...this.config,
      ...config,
      componentLevels };
    this.setupTransports();
  }
  
  /**
   * Create a new logger for the specified component
   * 
   * @param component The component name
   * @returns A LogService instance
   */
  createLogger(component: string): LogService {
    return new DefaultLogService(
      component,
      this.getLogLevel(component),
      this.transports,
      this.config.globalMetadata || {}
    );
  }
  
  /**
   * Get the log level for a specific component
   * 
   * @param component The component name
   * @returns The log level for the component
   */
  private getLogLevel(component: string): LogLevel {
    return this.config.componentLevels?.[component] || this.config.defaultLevel;
  }
  
  /**
   * Set up the transports based on the configuration
   */
  private setupTransports(): void {
    // Clear existing transports
    this.transports = [];
    
    // Add console transport by default
    this.transports.push(new ConsoleTransport({
      format: this.config.format,
      quietMode: this.quietMode
    }));
    
    // Add file transport if configured
    if (this.config.fileLogging?.enabled) {
      this.transports.push(
        new FileTransport({
          path: this.config.fileLogging.path,
          format: this.config.fileLogging.format || this.config.format
        })
      );
    }
    
    // Add HTTP transport if configured
    if (this.config.httpLogging?.enabled) {
      this.transports.push(
        new HttpTransport({
          url: this.config.httpLogging.url,
          maxBufferSize: this.config.httpLogging.batchSize,
          flushInterval: this.config.httpLogging.flushInterval,
          headers: this.config.httpLogging.headers
        })
      );
    }
  }
  
  /**
   * Flush all transports
   * 
   * @returns A promise that resolves when all transports have been flushed
   */
  async flushAll(): Promise<void> {
    await Promise.all(this.transports.map(transport => transport.flush()));
  }
  
  /**
   * Enable or disable quiet mode
   *
   * In quiet mode, only important messages are shown:
   * - Startup messages
   * - Cycle start/end messages
   * - Search execution messages
   * - Tweet found/not found messages
   * - Rate limit messages
   * - Error messages
   *
   * @param enabled Whether to enable quiet mode
   */
  setQuietMode(enabled: boolean): void {
    this.quietMode = enabled;
    this.setupTransports();
  }
  
  /**
   * Check if quiet mode is enabled
   */
  isQuietMode(): boolean {
    return this.quietMode;
  }
}