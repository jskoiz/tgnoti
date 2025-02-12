# ADR 036: Architectural Consolidation

[Previous sections unchanged...]

## Extended Implementation Details

### Configuration Validation

The ConfigManager will implement comprehensive validation:

```typescript
class ConfigManager {
  private validateTwitterConfig(): void {
    const { twitter } = this.config;
    
    // Validate bearer token format and expiration
    if (!this.isValidBearerToken(twitter.bearerToken)) {
      throw new ConfigError('Invalid Twitter bearer token format');
    }
    
    // Validate search queries
    for (const [id, query] of Object.entries(twitter.searchQueries)) {
      if (query.type === 'structured' && !query.mentions?.length && !query.accounts?.length) {
        throw new ConfigError(`Search query ${id} must have either mentions or accounts`);
      }
    }
    
    // Validate polling interval
    if (twitter.pollingInterval < 30000) { // 30 seconds minimum
      throw new ConfigError('Polling interval must be at least 30 seconds');
    }
  }

  private validateTelegramConfig(): void {
    const { telegram } = this.config;
    
    // Validate bot token format
    if (!/^\d+:[A-Za-z0-9-_]+$/.test(telegram.botToken)) {
      throw new ConfigError('Invalid Telegram bot token format');
    }
    
    // Validate group ID format
    if (!/^-\d+$/.test(telegram.groupId)) {
      throw new ConfigError('Invalid Telegram group ID format');
    }
    
    // Validate topic IDs exist
    if (!this.config.monitoring.topics[telegram.defaultTopicId]) {
      throw new ConfigError(`Default topic ID ${telegram.defaultTopicId} not found`);
    }
  }
}
```

### Dependency Injection

We will use InversifyJS for dependency injection:

```typescript
// container.ts
import { Container } from 'inversify';
import "reflect-metadata";

const container = new Container();

// Bind interfaces to implementations
container.bind<TweetMonitor>(TYPES.TweetMonitor).to(TweetMonitorImpl);
container.bind<MessageProcessor>(TYPES.MessageProcessor).to(MessageProcessorImpl);
container.bind<NotificationManager>(TYPES.NotificationManager).to(NotificationManagerImpl);
container.bind<MessageQueue>(TYPES.MessageQueue).to(RateLimitedQueue);
container.bind<FilterPipeline>(TYPES.FilterPipeline).to(FilterPipelineImpl);

// Bind configurations
container.bind<AppConfig>(TYPES.AppConfig).toConstantValue(ConfigManager.getInstance().getConfig());

export { container };
```

### Queue Management and Rate Limiting

Enhanced queue implementation with detailed error handling:

```typescript
class RateLimitedQueue implements MessageQueue<FormattedMessage> {
  private queue: FormattedMessage[] = [];
  private rateLimiter: RateLimiter;
  private metrics: QueueMetrics;

  constructor(
    private maxRate: number,
    private windowMs: number,
    private maxRetries: number = 3,
    private baseDelay: number = 1000
  ) {
    this.rateLimiter = new RateLimiter(maxRate, windowMs);
    this.metrics = new QueueMetrics();
  }

  async enqueue(message: FormattedMessage): Promise<void> {
    try {
      await this.rateLimiter.acquire();
      this.queue.push(message);
      this.metrics.incrementEnqueued();
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        // Queue for later processing
        this.queue.push(message);
        this.metrics.incrementRateLimited();
      } else {
        throw error;
      }
    }
  }

  async dequeue(): Promise<FormattedMessage> {
    const message = this.queue.shift();
    if (!message) throw new QueueEmptyError();
    
    let attempts = 0;
    while (attempts < this.maxRetries) {
      try {
        await this.processMessage(message);
        this.metrics.incrementProcessed();
        return message;
      } catch (error) {
        attempts++;
        this.metrics.incrementRetry();
        
        if (attempts === this.maxRetries) {
          this.metrics.incrementFailed();
          throw new MaxRetriesExceededError(message, error as Error);
        }
        
        // Exponential backoff
        await sleep(this.baseDelay * Math.pow(2, attempts));
      }
    }
    throw new Error('Unreachable code');
  }
}
```

### Error Handling Strategy

Comprehensive error handling workflow:

```typescript
class NotificationManagerImpl implements NotificationManager {
  private errorHandler: ErrorHandler;
  private metrics: NotificationMetrics;

  constructor(
    @inject(TYPES.ErrorHandler) errorHandler: ErrorHandler,
    @inject(TYPES.Metrics) metrics: NotificationMetrics
  ) {
    this.errorHandler = errorHandler;
    this.metrics = metrics;
  }

  async handleError(error: Error): Promise<void> {
    // Log error with context
    this.metrics.incrementError(error.name);
    
    if (error instanceof RateLimitExceededError) {
      // Handle rate limiting
      await this.handleRateLimit(error);
    } else if (error instanceof NetworkError) {
      // Handle network issues
      await this.handleNetworkError(error);
    } else if (error instanceof ValidationError) {
      // Handle validation failures
      await this.handleValidationError(error);
    } else {
      // Unknown errors
      await this.errorHandler.escalate(error);
    }
  }

  private async handleRateLimit(error: RateLimitExceededError): Promise<void> {
    const backoffTime = this.calculateBackoff(error);
    await this.errorHandler.notify({
      level: 'warning',
      message: `Rate limit exceeded. Backing off for ${backoffTime}ms`,
      error
    });
    await sleep(backoffTime);
  }
}
```

### Metrics and Monitoring

Comprehensive metrics collection:

```typescript
interface Metrics {
  // Tweet processing metrics
  tweetsProcessed: Counter;
  tweetsFiltered: Counter;
  processingLatency: Histogram;
  
  // Queue metrics
  queueSize: Gauge;
  queueLatency: Histogram;
  messageRetries: Counter;
  
  // Error metrics
  errorCount: Counter;
  rateLimitHits: Counter;
  
  // Filter metrics
  filterRuleHits: Counter;
  filterLatency: Histogram;
}

class MetricsManager {
  private static instance: MetricsManager;
  private metrics: Metrics;
  
  private constructor() {
    this.initializeMetrics();
  }
  
  private initializeMetrics(): void {
    // Initialize all metrics with proper labels
    this.metrics = {
      tweetsProcessed: new Counter('tweets_processed_total', 'Total tweets processed'),
      tweetsFiltered: new Counter('tweets_filtered_total', 'Total tweets filtered'),
      processingLatency: new Histogram('tweet_processing_duration_ms', 'Tweet processing duration'),
      // ... initialize other metrics
    };
  }
  
  public recordFilterDecision(rule: string, duration: number, passed: boolean): void {
    this.metrics.filterRuleHits.inc({ rule, passed });
    this.metrics.filterLatency.observe(duration);
  }
}
```

### Developer Documentation

```typescript
/**
 * Tweet Monitor Component
 * 
 * Responsible for monitoring Twitter API for new tweets matching configured criteria.
 * 
 * Key Features:
 * - Configurable polling intervals
 * - Rate limit awareness
 * - Automatic retry with exponential backoff
 * - Metric collection
 * 
 * Usage:
 * ```typescript
 * const monitor = container.get<TweetMonitor>(TYPES.TweetMonitor);
 * monitor.onNewTweets(async (tweets) => {
 *   // Process new tweets
 * });
 * await monitor.start();
 * ```
 */
@injectable()
class TweetMonitorImpl implements TweetMonitor {
  // Implementation
}
```

### Future Extensions

The architecture is designed for extensibility:

1. Adding New Filter Rules:
```typescript
// Example: Adding a new sentiment filter
@injectable()
class SentimentFilterRule implements FilterRule {
  name = 'SentimentFilter';
  priority = 50;

  constructor(
    @inject(TYPES.SentimentAnalyzer) private analyzer: SentimentAnalyzer
  ) {}

  async apply(tweet: Tweet): Promise<boolean> {
    const sentiment = await this.analyzer.analyze(tweet.text);
    return sentiment.score > 0; // Only allow positive tweets
  }
}
```

2. Supporting New Platforms:
```typescript
// Example: Adding Discord support
@injectable()
class DiscordNotificationManager implements NotificationManager {
  constructor(
    @inject(TYPES.DiscordClient) private discord: DiscordClient,
    @inject(TYPES.MessageFormatter) private formatter: MessageFormatter
  ) {}

  async sendMessage(message: FormattedMessage): Promise<void> {
    const discordMessage = this.formatter.toDiscordFormat(message);
    await this.discord.send(discordMessage);
  }
}
```

## Migration and Rollout Strategy

1. Feature Flags:
```typescript
const FEATURES = {
  NEW_CONFIG_MANAGER: 'new_config_manager',
  RATE_LIMITED_QUEUE: 'rate_limited_queue',
  FILTER_PIPELINE: 'filter_pipeline'
};

class FeatureManager {
  static isEnabled(feature: string): boolean {
    return process.env[`ENABLE_${feature.toUpperCase()}`] === 'true';
  }
}
```

2. Data Migration:
```typescript
async function migrateConfigs(): Promise<void> {
  // Load old config
  const oldConfig = await loadLegacyConfig();
  
  // Transform to new format
  const newConfig = transformConfig(oldConfig);
  
  // Validate new config
  await validateNewConfig(newConfig);
  
  // Save with version
  await saveConfig(newConfig, { version: '2.0.0' });
}
```

3. Monitoring During Rollout:
```typescript
class RolloutMonitor {
  private static instance: RolloutMonitor;
  
  async checkHealth(): Promise<HealthStatus> {
    const metrics = await this.gatherMetrics();
    const errors = await this.checkErrorRates();
    
    return {
      healthy: errors.rate < 0.01, // Less than 1% error rate
      metrics,
      errors
    };
  }
  
  async rollback(): Promise<void> {
    // Disable new features
    await this.disableFeatures();
    // Restore old config
    await this.restoreBackup();
    // Notify team
    await this.notifyRollback();
  }
}
```

[Previous sections unchanged...]