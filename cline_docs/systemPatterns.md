# Twitter Search System Patterns

## Layered Architecture Overview

The Twitter search implementation follows a layered architecture with several key components working together:

### Layer 1: API Rate Management
- RateLimitedQueue handles low-level API request throttling
- RettiwtKeyManager manages API key rotation
- Works directly with the Twitter API
- Ensures stable API interaction without rate limit issues

### Layer 2: Search Optimization
- SearchCacheManager provides 60-second TTL caching
- SearchStrategy manages search organization and pagination
- Reduces API calls through caching and deduplication
- Handles cursor-based pagination for large result sets

### Layer 3: Business Logic
- TweetProcessor handles tweet validation and processing
- MessageFormatter manages output formatting
- Implements business rules and data transformation

These layers work together to provide efficient search and processing:
1. Layer 1 ensures API stability and manages rate limits
2. Layer 2 optimizes search performance and reduces API calls
3. Layer 3 handles business requirements and data formatting

## Implementation Patterns

The Twitter search implementation follows several key architectural patterns and principles:

### 1. Rate Limiting Pattern

The `RateLimitedQueue` implements a token bucket-style rate limiter with async initialization:

```typescript
@injectable()
class RateLimitedQueue {
  private queue: QueueTask[] = [];
  private processing: boolean = false;
  private requestsPerSecond: number = 1;
  private lastProcessTime: number;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.queue = [];
    this.processing = false;
    this.requestsPerSecond = 1; // Default rate limit
    this.lastProcessTime = Date.now();
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing rate-limited queue');
    this.startProcessing(); // Launch processing in the background
    return Promise.resolve();
  }

  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;
    
    (async () => {
      while (this.processing) {
        try {
          const task = this.queue.shift();
          if (!task) {
            await new Promise(resolve => setTimeout(resolve, 100));
            continue;
          }

          const now = Date.now();
          const timeSinceLastProcess = now - this.lastProcessTime;
          const minInterval = 1000 / this.requestsPerSecond;

          if (timeSinceLastProcess < minInterval) {
            await new Promise(resolve => 
              setTimeout(resolve, minInterval - timeSinceLastProcess)
            );
          }

          await task();
          this.lastProcessTime = Date.now();
          this.metrics.increment('queue.tasks.processed');
        } catch (error) {
          this.logger.error('Error processing queue task:', error);
          this.metrics.increment('queue.tasks.errors');
        }
      }
    })();
  }
}
```

Benefits:
- Non-blocking initialization
- Precise rate control
- Dynamic rate adjustment
- Queue-based task management
- Metrics tracking for monitoring

### 2. Message Formatting Pattern

The `EnhancedMessageFormatter` implements a structured message formatting pattern with clear visual separation:

```typescript
@injectable()
class EnhancedMessageFormatter implements TweetFormatter {
  public formatMessage(config: TweetMessageConfig): string {
    const { tweet, quotedTweet, showSummarizeButton, translationMessage } = config;
    
    const parts = [
      this.formatHeader(tweet),
      this.formatTimestamp(tweet.createdAt),
      this.formatEngagementMetrics(tweet),
      '',
      '',  // Double line break for visual separation
      tweet?.text || '',
      this.formatMediaIndicator(tweet.media),
      quotedTweet ? this.formatQuotedTweet(quotedTweet) : '',
      translationMessage || '',
      '',
      this.formatButtons(showSummarizeButton || false)
    ];

    return parts.filter(Boolean).join('\n');
  }
}
```

Benefits:
- Clear visual hierarchy
- Consistent message structure
- Distinct separation between metadata and content
- Easy to modify formatting patterns
- Maintainable component organization

### 3. Builder Pattern

The `RettiwtSearchBuilder` implements the Builder pattern to construct search filters:

```typescript
@injectable()
class RettiwtSearchBuilder {
  constructor(@inject(TYPES.Logger) private logger: Logger) {}

  buildSimpleWordSearch(word: string): TweetFilter {
    const filter = {
      includeWords: [word.toLowerCase()],
      language: 'en',
      links: true,
      replies: true,
      minLikes: 0,
      minReplies: 0,
      minRetweets: 0
    };
    return new TweetFilter(filter);
  }

  buildFilter(config: SearchQueryConfig): TweetFilter {
    const includeWords: string[] = [];
    
    if (config.keywords?.length) {
      includeWords.push(...config.keywords);
    }
    
    if (config.accounts?.length) {
      includeWords.push(...config.accounts.map(a => `from:${a.replace(/^@/, '')}`));
    }
    
    if (config.mentions?.length) {
      includeWords.push(...config.mentions.map(m => `@${m.replace(/^@/, '')}`));
    }

    if (includeWords.length === 0) {
      throw new Error('Invalid search config: No search criteria provided');
    }

    return new TweetFilter({
      includeWords,
      language: config.language,
      startDate: config.startTime ? new Date(config.startTime) : undefined,
      endDate: config.endTime ? new Date(config.endTime) : undefined,
      links: !config.excludeQuotes
    });
  }
}
```

Benefits:
- Encapsulates filter construction logic
- Provides a clean interface for creating different types of filters
- Validates search criteria
- Handles date conversions and formatting

### 4. Dependency Injection

The implementation uses Inversify for dependency injection:

```typescript
@injectable()
export class RettiwtSearchBuilder {
  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {}
}
```

Benefits:
- Loose coupling between components
- Easier testing through mock injection
- Flexible configuration management
- Clear dependency hierarchy

### 5. Interface-Based Dependency Resolution

The system uses interfaces to break circular dependencies and improve modularity:

```typescript
// Interface definition
interface IDateValidator {
  getCurrentTime(): Promise<Date>;
  validateSystemTime(): Promise<void>;
  validateSearchWindow(startDate: Date, endDate: Date): Promise<void>;
  validateTweetDate(tweet: any): Promise<boolean>;
}

// Implementation
@injectable()
class DateValidator implements IDateValidator {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {}
}

// Dependent service using interface
@injectable()
class SearchConfig {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.DateValidator) private dateValidator: IDateValidator
  ) {}
}
```

Benefits:
- Breaks circular dependencies
- Improves code modularity
- Enables better testing through interface mocking
- Supports dependency inversion principle
- Allows two-phase initialization when needed
- Reduces coupling between components

### 6. Search Configuration Pattern

The search configuration system uses a streamlined approach with a 5-day search window:

```typescript
interface SearchQueryConfig {
  type: 'structured';
  accounts?: string[];    // For searching tweets from specific accounts
  mentions?: string[];    // For searching mentions of specific accounts
  keywords?: string[];    // For general keyword search
  language: string;       // Tweet language (e.g., 'en')
  startTime?: string;     // ISO timestamp for search window start
  endTime?: string;       // ISO timestamp for search window end
  excludeQuotes?: boolean; // Whether to exclude quoted tweets
}

// Search window configuration
const searchWindow = {
  pastDays: 5,           // Search up to 5 days in the past
  futureDays: 7,         // Allow tweets scheduled up to 7 days ahead
  defaultWindow: 5       // Default to 5-day search window
};
```

Benefits:
- Clear separation of search criteria
- Type-safe configuration handling
- Flexible search options
- Built-in validation rules
- Focused search window for relevant results
- Optimized data retrieval

### 7. Strategy Pattern

The search implementation uses different strategies based on the search type:

```typescript
buildFilter(config: SearchQueryConfig): TweetFilter {
  const includeWords: string[] = [];
  
  if (config.keywords?.length) {
    includeWords.push(...config.keywords);
  }
  
  if (config.accounts?.length) {
    includeWords.push(...config.accounts.map(a => `from:${a.replace(/^@/, '')}`));
  }
  
  if (config.mentions?.length) {
    includeWords.push(...config.mentions.map(m => `@${m.replace(/^@/, '')}`));
  }

  return new TweetFilter({
    includeWords,
    language: config.language,
    startDate: config.startTime ? new Date(config.startTime) : undefined,
    endDate: config.endTime ? new Date(config.endTime) : undefined,
    links: !config.excludeQuotes
  });
}
```

Benefits:
- Encapsulates different search algorithms
- Easy to add new search strategies
- Clean separation of concerns
- Consistent error handling

### 8. Observer Pattern

The logging and metrics system implements an observer-like pattern:

```typescript
this.logger.debug(`Built filter: ${JSON.stringify(filter)}`);
this.metrics.increment('search.attempt');
```

Benefits:
- Decoupled monitoring and logging
- Easy to add new observers
- Non-blocking operation
- Consistent metrics collection

## Code Organization

### 1. Layer Separation

The implementation follows a clear layer separation:

```
src/
  ├── twitter/          # Twitter-specific implementations
  ├── types/            # TypeScript type definitions
  ├── utils/            # Shared utilities
  ├── config/           # Configuration management
  └── tests/            # Test files
```

### 2. Interface Segregation

Interfaces are kept focused and specific:

```typescript
interface SearchQueryConfig {
  type: 'structured';
  language: string;
  accounts?: string[];
  mentions?: string[];
  keywords?: string[];
  startTime?: string;
  endTime?: string;
  excludeQuotes?: boolean;
}
```

## Error Handling Patterns

### 1. Error Hierarchy

```typescript
class RettiwtError extends Error {
  constructor(
    public code: number,
    message: string
  ) {
    super(message);
  }
}
```

### 2. Error Recovery

The implementation uses multiple error recovery patterns:

1. **Circuit Breaker**:
```typescript
@injectable()
class CircuitBreaker {
  private failures = 0;
  private lastFailure: number = 0;
  private lastTest: number = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private readonly testInterval: number;

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }

    try {
      if (this.isHalfOpen()) {
        if (Date.now() - this.lastTest < this.testInterval) {
          throw new Error('Circuit breaker is open');
        }
        this.lastTest = Date.now();
      }

      const result = await operation();
      this.reset();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        throw error;
      }

      this.recordFailure(error);
      throw error;
    }
  }
}
```

2. **Retry with Backoff**:
```typescript
private async retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T>
```

## Testing Patterns

### 1. Unit Testing

```typescript
describe('RettiwtSearchBuilder', () => {
  describe('buildFilter', () => {
    it('should create a search filter with accounts and mentions', () => {
      const filter = searchBuilder.buildFilter({
        type: 'structured',
        accounts: ['user1'],
        mentions: ['user2'],
        language: 'en'
      });
      expect(filter.accounts).toEqual(['user1']);
      expect(filter.mentions).toEqual(['user2']);
    });
  });
});
```

### 2. Integration Testing

```typescript
describe('TwitterClient', () => {
  describe('searchTweets', () => {
    it('should perform a search with accounts and mentions', async () => {
      const result = await client.searchTweets({
        type: 'structured',
        accounts: ['user1'],
        mentions: ['user2'],
        language: 'en'
      });
      expect(result).toBeDefined();
    });
  });
});
```

## Configuration Patterns

### 1. Environment-based Configuration

```typescript
const config = {
  apiKey: process.env.RETTIWT_API_KEY,
  timeout: parseInt(process.env.API_TIMEOUT || '5000'),
  retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3')
};
```

### 2. Type-safe Configuration

```typescript
interface TwitterConfig {
  apiKey: string;
  timeout: number;
  retryAttempts: number;
}

function validateConfig(config: Partial<TwitterConfig>): config is TwitterConfig {
  return Boolean(
    config.apiKey &&
    typeof config.timeout === 'number' &&
    typeof config.retryAttempts === 'number'
  );
}
```

## Monitoring Patterns

### 1. Structured Logging

```typescript
interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, error?: Error): void;
  error(message: string, error?: Error): void;
}
```

### 2. Metrics Collection

```typescript
interface MetricsManager {
  increment(metric: string): void;
  gauge(metric: string, value: number): void;
  timing(metric: string, timeMs: number): void;
}
```

## Initialization Patterns

### 1. Asynchronous Initialization

The implementation uses a clear initialization sequence to prevent race conditions:

```typescript
const initializeContainer = async () => {
  // Initialize logger first
  const logger = new ConsoleLogger();
  container.bind(TYPES.Logger).toConstantValue(logger);

  // Initialize rate limiter
  const rateLimitedQueue = new RateLimitedQueue(logger, metricsManager);
  await rateLimitedQueue.initialize();
  container.bind(TYPES.RateLimitedQueue).toConstantValue(rateLimitedQueue);

  // Create and initialize TwitterClient
  const twitterClient = new TwitterClient(
    logger,
    circuitBreaker,
    metricsManager,
    configManager,
    keyManager,
    rateLimitedQueue
  );
  await twitterClient.initialize();
  container.bind(TYPES.TwitterClient).toConstantValue(twitterClient);
};
```

Benefits:
- Prevents race conditions
- Clear initialization order
- Proper error handling during startup
- Verifiable startup sequence

These patterns provide a solid foundation for maintaining and extending the Twitter search functionality while ensuring code quality, testability, and reliability.

### 9. API Key Management Pattern

The RettiwtKeyManager implements a key rotation pattern for handling multiple API keys:

```typescript
@injectable()
class RettiwtKeyManager {
  private currentKeyIndex: number = 0;
  private apiKeys: string[] = [];
  private lastRotation: number = Date.now();
  private rotationInterval: number = 60 * 1000; // 1 minute default

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager
  ) {
    this.initializeKeys();
  }

  public getCurrentKey(): string {
    return this.apiKeys[this.currentKeyIndex];
  }

  public rotateKey(): string {
    if (this.apiKeys.length <= 1) {
      return this.getCurrentKey();
    }

    const now = Date.now();
    if (now - this.lastRotation < this.rotationInterval) {
      return this.getCurrentKey();
    }

    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    this.lastRotation = now;
    return this.getCurrentKey();
  }

  public markKeyError(error: any): void {
    if (error?.status === 429) {
      this.rotateKey();
    }
  }
}
```

Benefits:
- Automatic key rotation on rate limits
- Multiple API key support
- Configurable rotation intervals
- Error-triggered rotation
- Metrics tracking for key usage

Integration with TwitterClient:

```typescript
@injectable()
class TwitterClient {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.RateLimitedQueue) private queue: RateLimitedQueue,
    @inject(TYPES.RettiwtKeyManager) private keyManager: RettiwtKeyManager
  ) {}
}
```

This pattern ensures efficient API key utilization and automatic handling of rate limits across multiple keys.