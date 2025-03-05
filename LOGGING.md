# Enhanced Logging System

This document describes the enhanced logging system implemented in the Twitter Notifier application.

## Features

### 1. Visual Distinction for Log Levels

Log levels are now visually distinct with color coding:
- **ERROR**: Red background
- **WARN**: Yellow text
- **INFO**: White text
- **DEBUG**: Blue text
- **SUCCESS/FAILURE**: Green/Red status indicators

### 2. Grouped Related Log Entries

Related log entries are now grouped together with indentation:
- Pipeline logs show the main pipeline start/end
- Stage logs are indented under their parent pipeline
- Batch processing logs are grouped with start/end markers

### 3. Summary Views for Batch Processing

Batch processing now includes summary information:
- Progress bar showing success/failure ratio
- Success rate percentage
- Age distribution of processed tweets
- Search results summary with age distribution
- Summarized results for large batches
- Actionable hints for configuration improvements

### 4. Log Folding with Markers

Log sections can be folded in compatible log viewers using markers:
- `[BATCH START:topicId]` and `[BATCH END:topicId]`
- `[PIPELINE START:tweetId]` and `[PIPELINE END:tweetId]`

### 5. Context-Based Filtering

Logs are automatically filtered based on context:
- Old tweets (>60 minutes) have reduced logging
- Duplicate tweets have reduced logging
- Large batches use summarized logging
- Rate limit errors are condensed

### 6. Improved Visual Pipeline Representation

Pipeline visualization is enhanced:
- Failed stages show the stage name (e.g., `✗:age_validation`)
- Color-coded status indicators
- More distinct symbols for different states

### 7. Log Categories with Prefixes

Logs are categorized with prefixes for easier filtering:
- `[PIPE]` - Pipeline-related logs
- `[STAGE]` - Stage processing logs
- `[PROC]` - Tweet processor logs
- `[SRCH]` - Search-related logs
- `[VALD]` - Validation logs

### 8. Real-Time Dashboard

A real-time dashboard is available for monitoring:
- Overall metrics (tweets processed, success rate)
- Pipeline stage performance
- System status (memory usage, circuit breaker)

## Using the Dashboard

To use the real-time dashboard:

```bash
# Run with dashboard enabled
npm run dashboard

# Or use the log viewer with dashboard
npm run log-viewer
```

## Configuration

The logging system can be configured in `src/config/loggingConfig.ts`:

- Component-specific log levels
- Filtering rules
- Format settings

## Summarized Logging

For batches with more than 5 tweets, the system now uses summarized logging:

```
[BATCH START:5573] Processing 17 tweets for KOL_MONITORING
[AGE FAILURES] 15 tweets failed age validation: 2 tweets at 74m, 5 tweets at 119m, 8 tweets at 1475m
[SUCCESS SUMMARY] 2 tweets successfully processed and sent to Telegram
[SUMMARY SEPARATOR] --------------------------------------------------
[BATCH SUMMARY:5573] KOL_MONITORING: [✓✓✗✗✗✗✗✗✗✗] 2/17 tweets (12%)
[AGE DISTRIBUTION] Tweets by age: 0-30m: 2, 30-60m: 0, 1-3h: 7, 12h+: 8
[HINT] Found 15 tweets outside the 30m window. To process these, set SEARCH_WINDOW_MINUTES=1625
[CONFIG] Search window: 30 minutes (08:29 AM - 08:59 AM)
[BATCH END:5573]
```

### Search Results Summary

Instead of logging each individual tweet found in a search, the system now provides a concise summary:

```
[SEARCH] Found 14 tweets in search (0-30m: 2, 30-60m: 3, 1-3h: 9)
```

This significantly reduces log volume while still providing useful information about the age distribution of found tweets.

## Filtering Rules

Default filtering rules in `DefaultLogService.ts`:

```typescript
private static filterRules = {
  // Skip detailed logs for old tweets (over 60 minutes)
  skipOldTweets: true,
  // Skip detailed logs for duplicate tweets
  skipDuplicates: true,
  // Skip detailed stage logs when summarized logging is enabled
  useSummarizedLogging: true
};
```

You can modify these rules to adjust the verbosity of the logs.