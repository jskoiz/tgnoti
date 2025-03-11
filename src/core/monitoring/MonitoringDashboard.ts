import { MetricsManager } from './MetricsManager.js';
import { Logger } from '../../types/logger.js';
import { MonitoringType, TopicState, ProcessedTweet } from '../../types/monitoring.js';
import { TelegramQueueMetrics } from '../../types/telegram.js';
import { CircuitBreakerConfig, EnhancedCircuitBreakerConfig } from '../../types/monitoring-enhanced.js';
import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { ColorFormatter } from '../../utils/colors.js';

interface EventMetrics {
  queueMetrics: TelegramQueueMetrics;
  overallMetrics: {
    totalProcessed: number;
    successRate: number;
    averageProcessingTime: number;
    activeTopics: number;
  };
}

interface TopicMetrics {
  [topicId: string]: {
    name: string;
    type: MonitoringType;
    processed: number;
    successful: number;
    failed: number;
    lastUpdateTime: number;
    averageProcessingTime: number;
    errorRate: number;
  };
}

interface SystemMetrics {
  rateLimiting: {
    currentWindow: number;
    remainingRequests: number;
    resetTime: number;
  };
  circuitBreaker: {
    status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    failureCount: number;
    lastFailureTime: number;
    nextRetryTime: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
}

@injectable()
export class MonitoringDashboard {
  private eventMetrics: EventMetrics = {
    queueMetrics: {
      queueLength: 0,
      processingTime: 0,
      successRate: 0,
      failureRate: 0,
      rateLimitHits: 0,
      averageRetryCount: 0
    },
    overallMetrics: {
      totalProcessed: 0,
      successRate: 0,
      averageProcessingTime: 0,
      activeTopics: 0
    }
  };

  private topicMetrics: TopicMetrics = {};

  private systemMetrics: SystemMetrics = {
    rateLimiting: {
      currentWindow: 0,
      remainingRequests: 0,
      resetTime: 0
    },
    circuitBreaker: {
      status: 'CLOSED',
      failureCount: 0,
      lastFailureTime: 0,
      nextRetryTime: 0
    },
    memory: {
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      rss: 0
    }
  };

  private updateInterval!: NodeJS.Timeout;
  private dashboardInterval!: NodeJS.Timeout;
  private formatter = new ColorFormatter();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.initializeMetrics();
    this.startMetricsCollection();
    this.startDashboardDisplay();
  }

  private initializeMetrics(): void {
    this.eventMetrics = {
      queueMetrics: {
        queueLength: 0,
        processingTime: 0,
        successRate: 0,
        failureRate: 0,
        rateLimitHits: 0,
        averageRetryCount: 0
      },
      overallMetrics: {
        totalProcessed: 0,
        successRate: 0,
        averageProcessingTime: 0,
        activeTopics: 0
      }
    };

    this.topicMetrics = {};

    this.systemMetrics = {
      rateLimiting: {
        currentWindow: 0,
        remainingRequests: 0,
        resetTime: 0
      },
      circuitBreaker: {
        status: 'CLOSED',
        failureCount: 0,
        lastFailureTime: 0,
        nextRetryTime: 0
      },
      memory: {
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0
      }
    };
  }

  private startMetricsCollection(): void {
    this.updateInterval = setInterval(() => {
      this.collectMetrics();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Start the dashboard display
   */
  private startDashboardDisplay(): void {
    // Check if we're in a terminal environment
    if (process.stdout.isTTY) {
      this.dashboardInterval = setInterval(() => {
        this.displayDashboard();
      }, 10000); // Update every 10 seconds
    }
  }

  /**
   * Display a real-time dashboard in the console
   */
  private displayDashboard(): void {
    // Only display if explicitly requested via environment variable
    if (process.env.SHOW_DASHBOARD !== 'true') {
      return;
    }

    console.clear();
    const now = new Date();
    
    console.log(this.formatter.bold('=== TWITTER MONITOR DASHBOARD ==='));
    console.log(`${this.formatter.dim(`Last updated: ${now.toLocaleTimeString()}`)}\n`);
    
    // Overall metrics
    console.log(this.formatter.bold('📊 OVERALL METRICS'));
    console.log(`Tweets Processed: ${this.formatter.cyan(String(this.eventMetrics.overallMetrics.totalProcessed))}`);
    console.log(`Success Rate: ${this.formatter.green(this.eventMetrics.overallMetrics.successRate.toFixed(1) + '%')}`);
    console.log(`Avg Processing Time: ${this.formatter.yellow(this.eventMetrics.overallMetrics.averageProcessingTime.toFixed(0) + 'ms')}`);
    console.log(`Active Topics: ${this.formatter.cyan(String(this.eventMetrics.overallMetrics.activeTopics))}\n`);
    
    // Topic metrics
    console.log(this.formatter.bold('🔍 TOPIC METRICS'));
    Object.entries(this.topicMetrics).forEach(([topicId, metrics]) => {
      const successRate = metrics.processed > 0 ? (metrics.successful / metrics.processed) * 100 : 0;
      const successRateFormatted = successRate >= 90
        ? this.formatter.green(`${successRate.toFixed(1)}%`)
        : successRate >= 50
          ? this.formatter.yellow(`${successRate.toFixed(1)}%`)
          : this.formatter.red(`${successRate.toFixed(1)}%`);
      
      console.log(`${this.formatter.cyan(metrics.name.padEnd(15))}: ${metrics.successful}/${metrics.processed} (${successRateFormatted}) - ${metrics.averageProcessingTime.toFixed(0)}ms avg`);
    });
    console.log();
    
    // System metrics
    console.log(this.formatter.bold('🖥️ SYSTEM STATUS'));
    const memoryUsedMB = Math.round(this.systemMetrics.memory.heapUsed / 1024 / 1024);
    const memoryTotalMB = Math.round(this.systemMetrics.memory.heapTotal / 1024 / 1024);
    console.log(`Memory: ${this.formatter.yellow(`${memoryUsedMB}MB / ${memoryTotalMB}MB`)} (${(memoryUsedMB / memoryTotalMB * 100).toFixed(1)}%)`);
    
    const circuitStatus = this.systemMetrics.circuitBreaker.status === 'CLOSED' 
      ? this.formatter.green('CLOSED') 
      : this.systemMetrics.circuitBreaker.status === 'HALF_OPEN' 
        ? this.formatter.yellow('HALF_OPEN') 
        : this.formatter.red('OPEN');
    
    console.log(`Circuit Breaker: ${circuitStatus}`);
    console.log(`Rate Limit: ${this.formatter.yellow(String(this.systemMetrics.rateLimiting.remainingRequests))} requests remaining\n`);
  }

  private async collectMetrics(): Promise<void> {
    try {
      // Update memory metrics
      const memoryUsage = process.memoryUsage();
      this.systemMetrics.memory = {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      };

      // Get metrics from MetricsManager
      const currentMetrics = await this.metrics.getMetrics();

      // Check if we're using EnhancedMetricsManager
      if (this.metrics instanceof MetricsManager) {
        // Get topic metrics if available
        if ('getAllTopicMetrics' in this.metrics) {
          const enhancedMetrics = this.metrics as any; // Type cast to access enhanced methods
          const topicMetricsMap = enhancedMetrics.getAllTopicMetrics();
          
          // Update topic metrics in our dashboard
          topicMetricsMap.forEach((metrics: Map<string, number>, topicId: string) => {
            const processed = metrics.get('processed') || 0;
            const successful = metrics.get('successful') || 0;
            const failed = metrics.get('failed') || 0;
            const processingTime = metrics.get('processingTime') || 0;
            
            // Update or create topic metrics
            if (this.topicMetrics[topicId]) {
              this.topicMetrics[topicId].processed = processed;
              this.topicMetrics[topicId].successful = successful;
              this.topicMetrics[topicId].failed = failed;
              this.topicMetrics[topicId].averageProcessingTime = processingTime;
            }
          });
        }
      }

      // Calculate overall metrics from topic metrics
      const totalProcessed = Object.values(this.topicMetrics)
        .reduce((sum, metrics) => sum + metrics.processed, 0);
      
      const totalSuccess = Object.values(this.topicMetrics)
        .reduce((sum, metrics) => sum + metrics.successful, 0);

      const avgProcessingTime = Object.values(this.topicMetrics)
        .reduce((sum, metrics) => sum + metrics.averageProcessingTime, 0) /
        Math.max(1, Object.keys(this.topicMetrics).length);

      this.eventMetrics.overallMetrics = {
        totalProcessed,
        successRate: totalProcessed > 0 ? (totalSuccess / totalProcessed) * 100 : 0,
        averageProcessingTime: avgProcessingTime,
        activeTopics: Object.keys(this.topicMetrics).length
      };

      this.logger.debug('Metrics updated', {
        timestamp: new Date().toISOString(),
        overallMetrics: this.eventMetrics.overallMetrics
      });

    } catch (error) {
      this.logger.error('Error collecting metrics', error instanceof Error ? error : new Error(String(error)));
    }
  }

  public updateTopicMetrics(
    topicId: string,
    name: string,
    type: MonitoringType,
    success: boolean,
    processingTime: number
  ): void {
    if (!this.topicMetrics[topicId]) {
      this.topicMetrics[topicId] = {
        name,
        type,
        processed: 0,
        successful: 0,
        failed: 0,
        lastUpdateTime: 0,
        averageProcessingTime: 0,
        errorRate: 0
      };
    }

    const metrics = this.topicMetrics[topicId];
    metrics.processed++;
    if (success) {
      metrics.successful++;
    } else {
      metrics.failed++;
    }
    metrics.lastUpdateTime = Date.now();
    metrics.averageProcessingTime = 
      (metrics.averageProcessingTime * (metrics.processed - 1) + processingTime) / metrics.processed;
    metrics.errorRate = (metrics.failed / metrics.processed) * 100;
  }

  public updateQueueMetrics(metrics: TelegramQueueMetrics): void {
    this.eventMetrics.queueMetrics = metrics;
  }

  public updateCircuitBreakerStatus(
    status: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    failureCount: number,
    config: EnhancedCircuitBreakerConfig
  ): void {
    this.systemMetrics.circuitBreaker = {
      status,
      failureCount,
      lastFailureTime: Date.now(),
      nextRetryTime: Date.now() + config.resetTimeout
    };
  }

  public updateRateLimitMetrics(
    remaining: number,
    resetTime: number,
    windowMs: number
  ): void {
    this.systemMetrics.rateLimiting = {
      currentWindow: windowMs,
      remainingRequests: remaining,
      resetTime
    };
  }

  public getDashboardData(): {
    events: EventMetrics;
    topics: TopicMetrics;
    system: SystemMetrics;
  } {
    return {
      events: this.eventMetrics,
      topics: this.topicMetrics,
      system: this.systemMetrics
    };
  }

  public cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    if (this.dashboardInterval) {
      clearInterval(this.dashboardInterval);
    }
  }
}