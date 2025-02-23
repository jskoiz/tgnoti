# Twitter Search Implementation Technical Documentation

## Overview

This document provides a detailed technical overview of the Twitter search implementation using the Rettiwt API. The implementation uses a layered architecture to efficiently handle search requests and process results.

## Component Interaction

The system uses three main layers that work together:

### 1. API Rate Management Layer
- RateLimitedQueue manages API request throttling (1 request/second default)
- RettiwtKeyManager handles API key rotation on rate limits
- Ensures stable API interaction without overwhelming the service
- Implements exponential backoff for retries

### 2. Search Optimization Layer
- SearchCacheManager provides 60-second TTL caching to reduce API calls
- SearchStrategy manages search organization and pagination
- Handles cursor-based pagination (100 results per page)
- Implements result deduplication

### 3. Business Logic Layer
- TweetProcessor validates and processes tweets
- MessageFormatter handles output formatting
- Implements business rules and data transformation

### Layer Interaction Flow
When processing 1000 search results:
1. SearchStrategy organizes the search with pagination
2. SearchCacheManager checks for cached results first
3. For uncached results, RateLimitedQueue manages API requests
4. RettiwtKeyManager rotates API keys if rate limits are hit
5. TweetProcessor handles validation and formatting of results

## API Usage

The application uses multiple APIs:
1. **Rettiwt API**: Used for all tweet searches and data retrieval
2. **Official Twitter API**: Used only for initial connectivity testing during startup
3. **Time APIs**: Used for reliable time verification
   - worldtimeapi.org (primary)
   - timeapi.io (backup)

## Core Components

### 1. RateLimitedQueue

Located in `src/core/RateLimitedQueue.ts`, this class manages low-level API request rates. It works in conjunction with SearchCacheManager and RettiwtKeyManager for efficient API access.

Key features:
- Asynchronous initialization
- Configurable requests per second
- Background processing loop
- Works with RettiwtKeyManager for key rotation
- Handles API-level rate limiting
- Used by TwitterClient for all API requests
- Generic type support for async operations

Usage:
```typescript
const queue = new RateLimitedQueue(logger, metricsManager);
await queue.initialize();  // Must be called before use
queue.setRateLimit(1);    // 1 request per second
```

### 2. RettiwtSearchBuilder

Located in `src/twitter/rettiwtSearchBuilder.ts`, this class is responsible for constructing search filters that comply with the Rettiwt API specifications.

#### Key Methods

##### `buildSimpleWordSearch(word: string): TweetFilter`
Creates a basic search filter for a single word.
```typescript
const filter = searchBuilder.buildSimpleWordSearch('trojan');
```
Parameters:
- `word`: The search term (automatically converted to lowercase for case-insensitive search)

Returns: A TweetFilter object with:
- `includeWords`: Array containing the lowercase search term
- `language`: 'en' (English)
- `links`: true (include tweets with links)
- `replies`: true (include reply tweets)
- `minLikes`: 0 (no minimum likes requirement)
- `minReplies`: 0 (no minimum replies requirement)
- `minRetweets`: 0 (no minimum retweets requirement)

##### `buildFilter(config: SearchQueryConfig): TweetFilter`
Creates a more complex search filter based on configuration options.

Supports two types of configurations:
1. Raw Query Configuration:
```typescript
{
  type: 'raw',
  query: 'from:user1 OR @user2',
  language: 'en'
}
```

2. Structured Query Configuration:
```typescript
{
  type: 'structured',
  accounts: ['@user1'],     // Case-sensitive Twitter handles
  mentions: ['@user2'],     // Case-sensitive Twitter handles
  keywords: ['keyword1'],
  operator: 'OR' | 'AND',
  language: 'en',
  startTime?: string,
  excludeQuotes?: boolean,
  excludeRetweets?: boolean
}
```

### 3. DateValidator

Located in `src/utils/dateValidation.ts`, this class handles all date-related validations with online time verification.

Key features:
- Multiple time API sources
- Automatic fallback on API failures
- 1-minute response caching
- Configurable time bounds
- System time validation

Usage:
```typescript
const dateValidator = new DateValidator(logger, metrics);

// Validate tweet date
const isValid = await dateValidator.validateTweetDate(tweet);

// Validate search window
await dateValidator.validateSearchWindow(startDate, endDate);

// Get current online time
const now = await dateValidator.getOnlineTime();
```

### 4. TweetFilter Properties

The TweetFilter class from rettiwt-api supports these properties:

```typescript
interface TweetFilter {
  endDate?: Date;              // End date for tweet search
  excludeWords?: string[];     // Words to exclude
  fromUsers?: string[];        // Case-sensitive usernames
  hashtags?: string[];         // Hashtags to search (without #)
  includePhrase?: string;      // Exact phrase to match
  includeWords?: string[];     // Words to include
  language?: string;           // Tweet language (e.g., 'en')
  links?: boolean;             // Include tweets with links (default: true)
  list?: string;              // List to search within
  maxId?: string;             // Max tweet ID to search before
  mentions?: string[];        // Case-sensitive usernames (without @)
  minLikes?: number;          // Minimum likes count
  minReplies?: number;        // Minimum replies count
  minRetweets?: number;       // Minimum retweets count
  optionalWords?: string[];   // Optional words to include
  quoted?: string;           // Search for quotes of this tweet ID
  replies?: boolean;         // Include reply tweets (default: true)
  sinceId?: string;         // Min tweet ID to search after
  startDate?: Date;         // Start date for tweet search
  toUsers?: string[];       // Users tweets are addressed to
  top?: boolean;           // Include top tweets only
}
```

## Implementation Details

### Initialization Order

The correct initialization order is crucial to prevent race conditions:

1. Create and initialize RateLimitedQueue
2. Create TwitterClient with the initialized queue
3. Initialize TwitterClient (sets rate limit and verifies connectivity)
4. Initialize DateValidator for time verification

Example from container.ts:
```typescript
// Initialize and bind RateLimitedQueue first
const rateLimitedQueue = new RateLimitedQueue(logger, metricsManager);
await rateLimitedQueue.initialize();

// Create and initialize TwitterClient
const twitterClient = new TwitterClient(
  logger,
  circuitBreaker,
  metricsManager,
  configManager,
  rateLimitedQueue
);
await twitterClient.initialize();

// Initialize DateValidator
const dateValidator = new DateValidator(logger, metricsManager);
await dateValidator.validateSystemTime();
```

### Search Process Flow

The search process flows through the three layers:

1. **Initial Setup** (Layer 3):
   ```typescript
   const dateValidator = new DateValidator(logger, metrics);
   await dateValidator.validateSystemTime();
   const searchBuilder = new RettiwtSearchBuilder(logger);
   ```

2. **Search Organization** (Layer 2):
   ```typescript
   // Check cache first
   const cached = await searchCacheManager.get({
     type: 'structured',
     accounts: ['TradeOnNova'],
     language: 'en'
   });
   
   if (cached) {
     return cached;
   }
   ```

3. **API Request** (Layer 1):
   ```typescript
   // If not cached, queue API request
   const result = await queue.add(async () => {
     const response = await client.tweet.search(filter);
     
     // Cache the results
     searchCacheManager.set(config, response.data);
     
     return response;
   });
   ```

This layered approach ensures:
- Efficient use of API resources through caching
- Controlled API request rates
- Proper handling of large result sets

### Error Handling

The implementation includes robust error handling:

```typescript
try {
  const result = await client.tweet.search(filter);
  // Process results
} catch (error) {
  if (error instanceof RettiwtError) {
    // Handle Rettiwt-specific errors
    switch (error.code) {
      case 32: // Authentication error
        logger.error('Invalid API key');
        break;
      case 88: // Rate limit exceeded
        logger.error('Rate limit reached');
        break;
      default:
        logger.error(`Search failed: ${error.message}`);
    }
  } else {
    // Handle general errors
    logger.error('Unexpected error:', error);
  }
}
```

## Best Practices

1. **Case Sensitivity**:
   - Use exact case matches for Twitter handles
   - Verify handle capitalization against Twitter profiles
   - Convert search keywords to lowercase for consistent results
   - The API handles case-insensitive matching for keywords only

2. **Time Handling**:
   - Always use online time sources for validation
   - Implement proper caching for time API responses
   - Use multiple time sources for redundancy
   - Keep search windows reasonably small (24 hours recommended)
   - Handle timezone differences appropriately

3. **Rate Limiting**:
   - Initialize RateLimitedQueue before using TwitterClient
   - Implement exponential backoff for retries
   - Monitor rate limit headers in responses
   - Consider implementing a rate limiter for high-volume searches

4. **Error Handling**:
   - Always wrap API calls in try-catch blocks
   - Log errors with appropriate context
   - Implement retry logic for transient failures

5. **Configuration**:
   - Store API keys in environment variables
   - Use configuration files for default search parameters
   - Implement proper configuration validation
   - Verify Twitter handle case sensitivity

## Example Implementations

### 1. Case-Sensitive Account Search
```typescript
const config = {
  type: 'structured',
  accounts: ['TradeOnNova'],  // Exact case match
  mentions: ['TradeWithPhoton'],  // Exact case match
  language: 'en'
};

const filter = searchBuilder.buildFilter(config);
const result = await client.tweet.search(filter);
```

### 2. Time-Bounded Search
```typescript
const now = await dateValidator.getOnlineTime();
const startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));

const config = {
  type: 'structured',
  keywords: ['keyword1', 'keyword2'],
  language: 'en',
  startTime: startDate.toISOString(),
  endTime: now.toISOString()
};

const filter = searchBuilder.buildFilter(config);
const result = await client.tweet.search(filter);
```

## Testing

The implementation includes comprehensive tests:

1. **Unit Tests**:
   - Test filter creation
   - Verify parameter handling
   - Check error cases
   - Test time validation
   - Verify case sensitivity handling

2. **Integration Tests**:
   - Verify API interaction
   - Test rate limiting
   - Check error handling
   - Validate time synchronization

## Monitoring and Logging

The implementation includes:

1. **Logging**:
   - Debug level for filter creation
   - Info level for successful searches
   - Error level for failures
   - Structured logging for better analysis
   - Time validation events

2. **Metrics**:
   - Search attempts
   - Success/failure rates
   - Response times
   - Rate limit usage
   - Time validation success/failure
   - API availability

## Future Improvements

1. **Caching**:
   - Implement result caching for frequent searches
   - Cache API responses with appropriate TTL
   - Enhanced time source caching

2. **Performance**:
   - Batch processing for multiple searches
   - Parallel processing where applicable
   - Result streaming for large datasets
   - Optimized time source selection

3. **Resilience**:
   - Circuit breaker implementation
   - Automatic retries with backoff
   - Fallback mechanisms
   - Additional time sources

## Related Documentation

- [Rettiwt API Documentation](https://github.com/Rettiwt/rettiwt-api)
- [Twitter API Rate Limits](https://developer.twitter.com/en/docs/twitter-api/rate-limits)
- [Error Codes Reference](https://developer.twitter.com/en/docs/twitter-api/v1/response-codes)
- [World Time API Documentation](https://worldtimeapi.org/)