import { injectable } from 'inversify';
import { LogLevel } from '../logging/LogService.js';

/**
 * Component-specific logging configuration
 */
export interface ComponentLogConfig {
  level: LogLevel;
  heartbeatInterval?: number;
  aggregationWindow?: number;
}

/**
 * LoggingConfig - Configuration for the logging system
 * 
 * This class provides configuration for the logging system, including
 * default log levels, component-specific log levels, and other settings.
 */
@injectable()
export class LoggingConfig {
  private readonly defaultLevel = LogLevel.INFO;
  
  // Component-specific logging configurations
  private readonly componentConfigs: Record<string, ComponentLogConfig> = {
    'RateLimitedQueue': {
      level: LogLevel.DEBUG,
      heartbeatInterval: 5000,     // 5s for more frequent health checks
      aggregationWindow: 30000     // 30s window for rate limit aggregation
    },
    'TwitterClient': {
      level: LogLevel.DEBUG
    },
    'TelegramMessageSender': {
      level: LogLevel.DEBUG
    },
    'TelegramMessageQueue': {
      level: LogLevel.DEBUG
    },
    'DuplicateCheckStage': {
      level: LogLevel.INFO
    },
    'FilterStage': {
      level: LogLevel.INFO
    },
    'ValidationStage': {
      level: LogLevel.INFO,
      aggregationWindow: 10000     // 10s window for validation aggregation
    },
    'TweetProcessor': {
      level: LogLevel.INFO
    },
    'SearchConfig': {
      level: LogLevel.INFO
    },
    'SearchStrategy': {
      level: LogLevel.INFO
    },
  };

  // File logging configuration
  private readonly fileLogging = {
    enabled: false,
    path: './logs/app.log',
    maxSize: '10m',
    maxFiles: 5,
    format: 'json' as const
  };

  // Format configuration
  private readonly format: 'json' | 'text' = 'text';

  /**
   * Get the component configuration
   * 
   * @param component The component name
   * @returns The component configuration
   */
  getComponentConfig(component: string): ComponentLogConfig {
    return this.componentConfigs[component] || { level: this.defaultLevel };
  }

  /**
   * Get the log level for a component
   * 
   * @param component The component name
   * @returns The log level
   */
  getLogLevel(component: string): LogLevel {
    return this.getComponentConfig(component).level;
  }

  /**
   * Get the heartbeat interval for a component
   * 
   * @param component The component name
   * @returns The heartbeat interval in milliseconds
   */
  getHeartbeatInterval(component: string): number {
    return this.getComponentConfig(component).heartbeatInterval || 5000; // Default 5s
  }

  /**
   * Get the aggregation window for a component
   * 
   * @param component The component name
   * @returns The aggregation window in milliseconds
   */
  getAggregationWindow(component: string): number {
    return this.getComponentConfig(component).aggregationWindow || 5000; // Default 5s
  }

  /**
   * Get the file logging configuration
   * 
   * @returns The file logging configuration
   */
  getFileLogging() {
    return this.fileLogging;
  }

  /**
   * Get the log format
   * 
   * @returns The log format
   */
  getFormat(): 'json' | 'text' {
    return this.format;
  }

  /**
   * Enable file logging
   * 
   * @param path The log file path
   */
  enableFileLogging(path?: string): void {
    this.fileLogging.enabled = true;
    if (path) {
      this.fileLogging.path = path;
    }
  }

  /**
   * Disable file logging
   */
  disableFileLogging(): void {
    this.fileLogging.enabled = false;
  }

  /**
   * Set the log level for a component
   * 
   * @param component The component name
   * @param level The log level
   */
  setComponentLogLevel(component: string, level: LogLevel): void {
    if (!this.componentConfigs[component]) {
      this.componentConfigs[component] = { level };
    } else {
      this.componentConfigs[component].level = level;
    }
  }

  /**
   * Get the full logging configuration
   * 
   * @returns The logging configuration
   */
  getFullConfig() {
    return {
      defaultLevel: this.defaultLevel,
      componentLevels: Object.entries(this.componentConfigs).reduce(
        (acc, [component, config]) => {
          acc[component] = config.level;
          return acc;
        },
        {} as Record<string, LogLevel>
      ),
      fileLogging: this.fileLogging,
      format: this.format
    };
  }
}