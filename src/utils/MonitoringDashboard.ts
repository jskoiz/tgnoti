import { MetricsManager } from './MetricsManager.js';
import { Logger } from '../types/logger.js';
import { MonitoringType, TopicState, ProcessedTweet } from '../types/monitoring.js';
import { TelegramQueueMetrics } from '../types/telegram.js';
import { CircuitBreakerConfig } from '../types/monitoring.js';
import { injectable, inject } from 'inversify';
import { TYPES } from '../types/di.js';

interface PipelineMetrics {
  stageMetrics: {
    [stageName: string]: {
      successCount: number;
      failureCount: number;
      averageProcessingTime: number;
      lastProcessingTime: number;
      errorsByType: { [errorType: string]: number };
    };
  };
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
  private pipelineMetrics: PipelineMetrics = {
    stageMetrics: {},
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

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): void {
    this.pipelineMetrics = {
      stageMetrics: {},
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

      // Update pipeline metrics
      Object.entries(currentMetrics).forEach(([key, value]) => {
        if (key.startsWith('pipeline.')) {
          const [_, stage, metric] = key.split('.');
          if (!this.pipelineMetrics.stageMetrics[stage]) {
            this.pipelineMetrics.stageMetrics[stage] = {
              successCount: 0,
              failureCount: 0,
              averageProcessingTime: 0,
              lastProcessingTime: 0,
              errorsByType: {}
            };
          }

          const stageMetrics = this.pipelineMetrics.stageMetrics[stage];
          if (metric === 'success') {
            stageMetrics.successCount = value as number;
          } else if (metric === 'failure') {
            stageMetrics.failureCount = value as number;
          } else if (metric === 'duration') {
            stageMetrics.lastProcessingTime = value as number;
            stageMetrics.averageProcessingTime = 
              (stageMetrics.averageProcessingTime + value as number) / 2;
          }
        }
      });

      // Calculate overall metrics
      const totalProcessed = Object.values(this.pipelineMetrics.stageMetrics)
        .reduce((sum, metrics) => sum + metrics.successCount + metrics.failureCount, 0);
      
      const totalSuccess = Object.values(this.pipelineMetrics.stageMetrics)
        .reduce((sum, metrics) => sum + metrics.successCount, 0);

      this.pipelineMetrics.overallMetrics = {
        totalProcessed,
        successRate: totalProcessed > 0 ? (totalSuccess / totalProcessed) * 100 : 0,
        averageProcessingTime: Object.values(this.pipelineMetrics.stageMetrics)
          .reduce((sum, metrics) => sum + metrics.averageProcessingTime, 0),
        activeTopics: Object.keys(this.topicMetrics).length
      };

      this.logger.debug('Metrics updated', {
        timestamp: new Date().toISOString(),
        overallMetrics: this.pipelineMetrics.overallMetrics
      });

    } catch (error) {
      this.logger.error('Error collecting metrics', {
        error: error instanceof Error ? error.message : String(error)
      });
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
    this.pipelineMetrics.queueMetrics = metrics;
  }

  public updateCircuitBreakerStatus(
    status: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    failureCount: number,
    config: CircuitBreakerConfig
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
    pipeline: PipelineMetrics;
    topics: TopicMetrics;
    system: SystemMetrics;
  } {
    return {
      pipeline: this.pipelineMetrics,
      topics: this.topicMetrics,
      system: this.systemMetrics
    };
  }

  public cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}