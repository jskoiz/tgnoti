# ADR 009: Telegram Message Queue System

## Status
Implemented

## Context
Our application is hitting Telegram API rate limits when sending messages in quick succession. The current implementation attempts to send messages immediately as they are processed, leading to 429 (Too Many Requests) errors. Each failed request includes a Retry-After header indicating the required wait time, but we're not effectively utilizing this information.

Current issues:
- Multiple messages failing with 429 errors
- Inefficient retry attempts that don't respect rate limits
- Wasted resources on failed requests
- Poor user experience due to message delivery failures

## Decision
We will implement a dedicated TelegramMessageQueue system that:

1. Queues messages for delivery instead of sending immediately
2. Manages sending rates based on Telegram's limits
3. Implements intelligent retry handling
4. Provides monitoring and metrics

### Queue Design
```typescript
interface QueuedMessage {
  chatId: number;
  threadId?: number;
  content: string;
  messageOptions: any;
  priority: number;
  retryCount: number;
  firstAttempt: Date;
  lastAttempt?: Date;
  nextAttemptTime?: Date;
  id: string; // Added unique identifier for tracking
}

class TelegramMessageQueue {
  private queue: QueuedMessage[];
  private processing: boolean;
  private paused: boolean;
  private lastSendTime: Date;
  private windowStartTime: Date;
  private messagesSentInWindow: number;
}
```

### Key Components

1. **Queue Manager**
   - Maintains ordered queue of messages with unique IDs
   - Handles message priorities (higher priority messages sent first)
   - Tracks rate limit windows
   - Manages retry attempts with exponential backoff
   - Supports pause/resume functionality

2. **Rate Limit Handler**
   - Tracks sending windows and counts
   - Respects Retry-After headers from Telegram API
   - Implements exponential backoff with configurable base delay
   - Adjusts sending rates dynamically based on response headers
   - Prevents rate limit violations proactively

3. **Monitoring System**
   - Tracks queue length and processing status
   - Monitors success/failure rates
   - Records processing times and rate limit hits
   - Provides detailed metrics for monitoring
   - Integrates with existing MetricsManager

### Dependency Injection Configuration
```typescript
// Container configuration
const telegramQueueConfig: TelegramQueueConfig = {
  baseDelayMs: 1000,
  rateLimitWindowMs: 60000, // 1 minute
  maxMessagesPerWindow: 20,
  maxRetries: 3,
  maxQueueSize: 1000,
  persistenceEnabled: false
};

container.bind<TelegramQueueConfig>(TYPES.TelegramQueueConfig)
  .toConstantValue(telegramQueueConfig);
container.bind<TelegramMessageQueue>(TYPES.TelegramMessageQueue)
  .to(TelegramMessageQueue)
  .inSingletonScope();
```

### Integration with TelegramBot
```typescript
@injectable()
export class TelegramBot {
  constructor(
    @inject(TYPES.TelegramMessageQueue) private messageQueue: ITelegramMessageQueue,
    // ... other dependencies
  ) {}

  async sendMessage(message: FormattedMessage): Promise<void> {
    const queuedMessageId = await this.messageQueue.queueMessage({
      chatId: parseInt(this.config.groupId),
      threadId: message.message_thread_id,
      content: message.text || '',
      messageOptions: {
        parse_mode: message.parse_mode,
        disable_web_page_preview: message.disable_web_page_preview,
        reply_markup: message.reply_markup
      },
      priority: 1
    });
  }
}
```

## Consequences

### Positive
- Prevents rate limit errors through proactive management
- Efficient resource utilization with prioritized queue
- Better message delivery reliability with smart retries
- Improved monitoring capabilities with detailed metrics
- Graceful handling of high load situations
- Seamless integration with existing bot infrastructure

### Negative
- Added system complexity with queue management
- Potential message delivery delays during high load
- Additional memory usage for queue storage
- Need for queue persistence consideration
- Increased configuration complexity

### Risks
- Queue memory growth under heavy load
- Message ordering challenges with priorities
- Potential for stale messages in long queues
- Recovery handling after system restarts
- Race conditions in multi-instance deployments

## Implementation Details

### Configuration
```typescript
export interface TelegramQueueConfig {
  baseDelayMs: number;        // Base delay between retries
  rateLimitWindowMs: number;  // Time window for rate limiting
  maxMessagesPerWindow: number; // Max messages per window
  maxRetries: number;         // Maximum retry attempts
  maxQueueSize: number;       // Maximum queue size
  persistenceEnabled: boolean; // Whether to persist queue
}
```

### Metrics Tracked
- telegram.queue.messages.queued
- telegram.queue.messages.sent
- telegram.queue.messages.failed
- telegram.queue.messages.ratelimited
- telegram.queue.messages.retried
- telegram.queue.processing_time

### Status Reporting
The queue system provides detailed status information through the TelegramBot's status command:
```
Message Queue:
- Queue Size: {currentQueueSize}
- Processing: {isProcessing}
- Success Rate: {successRate}%
- Rate Limit Hits: {rateLimitHits}
```

## Future Considerations

1. Queue Persistence
   - Implement file-based persistence
   - Add recovery mechanisms
   - Handle system restarts gracefully

2. Priority Message Handling
   - Define priority levels
   - Implement priority-based ordering
   - Add priority boost for retries

3. Dead Letter Queue
   - Store permanently failed messages
   - Implement retry policies
   - Add manual retry capability

4. Admin Interface
   - View queue status
   - Manage message priorities
   - Clear or retry failed messages

5. Distributed Queue System
   - Support multiple bot instances
   - Implement distributed locking
   - Handle cross-instance coordination

## References

- Telegram Bot API rate limiting documentation
- Existing RateLimitedQueue implementation
- System monitoring metrics
- ADR 005: Dependency Injection Improvements