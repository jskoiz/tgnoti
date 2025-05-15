import { EventEmitter } from 'events';
import { MetricsManager } from '../../../core/monitoring/MetricsManager.js';
import { EnhancedMetricsManager } from '../../../core/monitoring/EnhancedMetricsManager.js';
import { ConfigManager } from '../../../config/ConfigManager.js';
import { Logger } from '../../../types/logger.js';
import { LoggerFactory } from '../../../logging/LoggerFactory.js';
import { TOPIC_CONFIG } from '../../../config/topicConfig.js';

/**
 * Central service that coordinates dashboard functionality
 */
export class DashboardService extends EventEmitter {
  private logger: Logger;
  private metricsManager: MetricsManager;
  private enhancedMetricsManager: EnhancedMetricsManager;
  private configManager: ConfigManager;
  private config: Record<string, any> = {};
  private topicConfig: typeof TOPIC_CONFIG = { ...TOPIC_CONFIG };

  constructor(
    metricsManager: MetricsManager,
    enhancedMetricsManager: EnhancedMetricsManager,
    configManager: ConfigManager
  ) {
    super();
    this.logger = LoggerFactory.getInstance().createLogger('DashboardService');
    this.metricsManager = metricsManager;
    this.enhancedMetricsManager = enhancedMetricsManager;
    this.configManager = configManager;
    this.loadConfig();
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfig(): void {
    // This is a simplified implementation
    // In a real implementation, you would load configuration from a persistent store
    this.config = {
      twitter: {
        enabled: process.env.TWITTER_ENABLED === 'true',
        searchInterval: parseInt(process.env.TWITTER_SEARCH_INTERVAL || '300000', 10),
        maxResults: parseInt(process.env.TWITTER_MAX_RESULTS || '100', 10)
      },
      telegram: {
        enabled: process.env.TELEGRAM_ENABLED === 'true',
        chatId: process.env.TELEGRAM_CHAT_ID || '',
        sendInterval: parseInt(process.env.TELEGRAM_SEND_INTERVAL || '1000', 10)
      },
      monitoring: {
        metricsInterval: parseInt(process.env.METRICS_INTERVAL || '60000', 10)
      }
    };
  }

  /**
   * Get current metrics
   */
  public getMetrics() {
    const basicMetrics = this.metricsManager.getMetrics();
    const enhancedMetrics = this.enhancedMetricsManager.getMetrics();
    
    return {
      timestamp: Date.now(),
      metrics: basicMetrics,
      enhancedMetrics
    };
  }

  /**
   * Get metrics by topic
   */
  public getMetricsByTopic() {
    const topicMetrics = this.enhancedMetricsManager.getAllTopicMetrics();
    
    return {
      timestamp: Date.now(),
      topicMetrics: Object.fromEntries(topicMetrics)
    };
  }

  /**
   * Get current configuration
   */
  public getConfig() {
    return this.config;
  }

  /**
   * Update configuration
   */
  public async updateConfig(config: any) {
    // In a real implementation, you would persist this configuration
    this.config = {
      ...this.config,
      ...config
    };
    
    // Update environment variables if needed
    if (config.twitter) {
      if (config.twitter.enabled !== undefined) {
        process.env.TWITTER_ENABLED = String(config.twitter.enabled);
      }
      if (config.twitter.searchInterval !== undefined) {
        process.env.TWITTER_SEARCH_INTERVAL = String(config.twitter.searchInterval);
      }
      if (config.twitter.maxResults !== undefined) {
        process.env.TWITTER_MAX_RESULTS = String(config.twitter.maxResults);
      }
    }
    
    if (config.telegram) {
      if (config.telegram.enabled !== undefined) {
        process.env.TELEGRAM_ENABLED = String(config.telegram.enabled);
      }
      if (config.telegram.chatId !== undefined) {
        process.env.TELEGRAM_CHAT_ID = config.telegram.chatId;
      }
      if (config.telegram.sendInterval !== undefined) {
        process.env.TELEGRAM_SEND_INTERVAL = String(config.telegram.sendInterval);
      }
    }
    
    this.emit('config-updated', config);
    return this.getConfig();
  }

  /**
   * Get topic configuration
   */
  public getTopicConfig() {
    return this.topicConfig;
  }

  /**
   * Update topic configuration
   */
  public async updateTopicConfig(topicConfig: any) {
    // In a real implementation, you would persist this configuration
    this.topicConfig = {
      ...this.topicConfig,
      ...topicConfig
    };
    
    this.emit('topic-config-updated', topicConfig);
    return this.getTopicConfig();
  }

  /**
   * Reset circuit breakers
   */
  public resetCircuitBreakers() {
    // Implementation depends on how circuit breakers are managed in the application
    this.logger.info('Resetting circuit breakers');
    
    try {
      // This is a placeholder. In a real implementation, you would call the actual
      // circuit breaker reset functionality from the application
      const { execSync } = require('child_process');
      execSync('node tools/reset-circuit-breakers.js');
      
      this.emit('circuit-breakers-reset');
      return { success: true };
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to reset circuit breakers', err);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get system status
   */
  public getSystemStatus() {
    // This would need to be implemented based on how system status is tracked
    // For now, we'll return a simplified status
    const twitterEnabled = process.env.TWITTER_ENABLED === 'true';
    const telegramEnabled = process.env.TELEGRAM_ENABLED === 'true';
    
    return {
      timestamp: Date.now(),
      status: 'operational',
      services: {
        twitter: {
          status: twitterEnabled ? 'operational' : 'disabled',
          circuitBreaker: 'closed' // This should be determined dynamically
        },
        telegram: {
          status: telegramEnabled ? 'operational' : 'disabled',
          circuitBreaker: 'closed' // This should be determined dynamically
        }
      }
    };
  }
}