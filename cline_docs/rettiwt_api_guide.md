# Rettiwt API Integration Guide for Tweet Monitoring

## Overview

This guide explains how to use the Rettiwt API specifically for our tweet monitoring use case. Our primary goal is to monitor Twitter for specific keywords, users, and mentions, with proper timestamp handling for chronological processing.

## Setup

### 1. Installation

```bash
npm install rettiwt-api
```

### 2. API Key Configuration

Store your API key in .env:
```env
RETTIWT_API_KEY=your_api_key_here
```

### 3. Basic Client Setup

```typescript
import { Rettiwt } from 'rettiwt-api';
import { RettiwtSearchBuilder } from './twitter/rettiwtSearchBuilder';
import { ConsoleLogger } from './utils/logger';
import { MetricsManager } from './utils/MetricsManager';
import { ErrorHandler } from './utils/ErrorHandler';

// Initialize dependencies
const logger = new ConsoleLogger();
const metrics = new MetricsManager(logger);
const errorHandler = new ErrorHandler(logger, metrics);

// Create search builder with all required dependencies
const searchBuilder = new RettiwtSearchBuilder(logger, metrics, errorHandler);

// Initialize Rettiwt client
const client = new Rettiwt({ 
  apiKey: process.env.RETTIWT_API_KEY 
});
```

## Common Use Cases

### 1. Simple Keyword Search

Use this when you just need to search for specific words:

```typescript
// Search for a single word
const filter = searchBuilder.buildSimpleWordSearch('trojan');
const results = await client.tweet.search(filter);

// Process results
for (const tweet of results.list) {
  console.log(`[${new Date(tweet.createdAt).toLocaleString()}] ${tweet.fullText}`);
}
```

### 2. Time-Based Monitoring

For monitoring recent tweets within a specific timeframe:

```typescript
const now = new Date();
const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));

const config = {
  type: 'structured',
  keywords: ['keyword1', 'keyword2'],
  language: 'en',
  startTime: oneDayAgo.toISOString(),
  endTime: now.toISOString()
};

const filter = searchBuilder.buildFilter(config);
const results = await client.tweet.search(filter);
```

### 3. User Monitoring

For tracking specific user accounts:

```typescript
const config = {
  type: 'structured',
  accounts: ['@user1', '@user2'],  // @ symbol will be stripped automatically
  language: 'en'
};

const filter = searchBuilder.buildFilter(config);
const results = await client.tweet.search(filter);
```

### 4. Mention Tracking

For monitoring mentions of specific accounts:

```typescript
const config = {
  type: 'structured',
  mentions: ['@user1', '@user2'],  // @ symbol will be stripped automatically
  language: 'en'
};

const filter = searchBuilder.buildFilter(config);
const results = await client.tweet.search(filter);
```

### 5. Engagement-Based Filtering

Filter tweets based on engagement metrics:

```typescript
const config = {
  type: 'structured',
  keywords: ['keyword'],
  language: 'en',
  minLikes: 100,      // Tweets with at least 100 likes
  minRetweets: 50,    // At least 50 retweets
  minReplies: 10      // At least 10 replies
};
```

### 6. Media Filtering

Search for tweets containing specific media types:

```typescript
// Find tweets with media
const mediaFilter = searchBuilder.buildFilter({
  type: 'structured',
  keywords: ['keyword'],
  language: 'en',
  media: true        // Only tweets with media
});

// Process media in results
for (const tweet of results.list) {
  if (tweet.media?.length) {
    tweet.media.forEach(m => {
      console.log(`Media type: ${m.type}, URL: ${m.url}`);
    });
  }
}
```

## Result Processing

### Tweet Object Structure

Each tweet in the results contains:

```typescript
interface Tweet {
  id: string;              // Tweet ID
  fullText: string;        // Complete tweet text
  createdAt: string;       // ISO timestamp
  retweetCount: number;    // Number of retweets
  replyCount: number;      // Number of replies
  likeCount: number;       // Number of likes
  viewCount: number;       // Number of views
  bookmarkCount: number;   // Number of bookmarks
  entities: {
    hashtags: string[];           // Array of hashtags without #
    mentionedUsers: string[];     // Array of mentioned usernames without @
    urls: string[];              // Array of URLs in tweet
  };
  tweetBy: {
    userName: string;      // Username without @
    fullName: string;      // Display name
    followersCount: number;
    followingsCount: number;
    verified: boolean;     // Verification status
  };
  quotedTweet?: {         // Optional quoted tweet
    id: string;
    fullText: string;
    tweetBy: {
      userName: string;
      fullName: string;
      verified: boolean;
    };
  };
  media?: {               // Optional media attachments
    url: string;
    type: string;
  }[];
}
```

### Entity Extraction

Extract mentions, hashtags, and URLs:

```typescript
function extractEntities(tweet: Tweet) {
  // Get mentions
  const mentions = tweet.entities?.mentionedUsers?.map(u => '@' + u) || [];
  
  // Get hashtags
  const hashtags = tweet.entities?.hashtags || [];
  
  // Get URLs
  const urls = tweet.entities?.urls || [];
  
  return { mentions, hashtags, urls };
}
```

### Timestamp Handling

Always use proper timestamp handling for consistency:

```typescript
function formatTweetDate(tweet: Tweet): string {
  const tweetDate = new Date(tweet.createdAt);
  return tweetDate.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}
```

## Performance Optimization

### 1. Batch Processing

Process tweets in batches to improve performance:

```typescript
async function processTweetBatch(tweets: Tweet[], batchSize = 100) {
  for (let i = 0; i < tweets.length; i += batchSize) {
    const batch = tweets.slice(i, i + batchSize);
    await Promise.all(batch.map(tweet => processTweet(tweet)));
  }
}
```

### 2. Caching Results

Implement result caching to avoid redundant API calls:

```typescript
class TweetCache {
  private cache: Map<string, Tweet> = new Map();
  private ttl: number;

  constructor(ttlMinutes = 15) {
    this.ttl = ttlMinutes * 60 * 1000;
  }

  set(tweet: Tweet): void {
    this.cache.set(tweet.id, tweet);
    setTimeout(() => this.cache.delete(tweet.id), this.ttl);
  }

  get(id: string): Tweet | undefined {
    return this.cache.get(id);
  }
}
```

## Error Handling

### Common Errors

1. Authentication Errors:
```typescript
try {
  const results = await client.tweet.search(filter);
} catch (error) {
  if (error.code === 32) {
    console.error('Invalid API key');
  }
}
```

2. Rate Limiting:
```typescript
try {
  const results = await client.tweet.search(filter);
} catch (error) {
  if (error.code === 88) {
    console.error('Rate limit reached');
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
```

### Rate Limit Management

Monitor rate limit headers in responses:

```typescript
interface RateLimitInfo {
  limit: number;      // Total requests allowed
  remaining: number;  // Requests remaining
  reset: number;      // Time until limit resets (seconds)
}

function parseRateLimitHeaders(headers: any): RateLimitInfo {
  return {
    limit: parseInt(headers['x-rate-limit-limit']),
    remaining: parseInt(headers['x-rate-limit-remaining']),
    reset: parseInt(headers['x-rate-limit-reset'])
  };
}
```

### Retry Strategy

Implement exponential backoff for retries:

```typescript
async function searchWithRetry(filter: TweetFilter, maxRetries = 3): Promise<Tweet[]> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.tweet.search(filter);
      return result.list;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt - 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('All retry attempts failed');
}
```

## Best Practices

1. **Rate Limiting**
   - Implement proper rate limiting
   - Use exponential backoff for retries
   - Monitor rate limit headers
   - Cache results when possible
   - Use batch processing for efficiency

2. **Error Handling**
   - Always wrap API calls in try-catch
   - Handle common error codes
   - Log errors with context
   - Implement retry logic
   - Monitor error rates

3. **Data Processing**
   - Process tweets chronologically
   - Store last processed tweet ID
   - Handle timezone differences
   - Validate tweet data
   - Extract entities properly

4. **Configuration**
   - Use environment variables
   - Implement proper validation
   - Document all settings
   - Monitor API usage
   - Keep API keys secure

## Troubleshooting

### Common Issues

1. Authentication Failures
   - Check API key is valid
   - Verify environment variables
   - Check for rate limiting
   - Monitor error logs
   - Verify API status

2. Rate Limiting
   - Implement proper delays
   - Use exponential backoff
   - Monitor usage patterns
   - Cache results
   - Batch requests

3. Missing Results
   - Check filter configuration
   - Verify timestamp ranges
   - Check language settings
   - Validate search terms
   - Monitor API responses

### Debugging

Enable debug logging:

```typescript
const client = new Rettiwt({
  apiKey: process.env.RETTIWT_API_KEY,
  debug: true,
  logger: {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
  }
});
```

## Support

For API-specific issues:
- Rettiwt API Documentation: [Link]
- GitHub Issues: [Link]
- Rate Limits Documentation: [Link]
- API Status Page: [Link]
- Developer Support: [Link]