# tgnoti

A high-performance notification bridge between Twitter and Telegram. Monitors Twitter for specific accounts or mentions and forwards matching tweets to configured Telegram groups.

## Features

- **Multi-topic monitoring**: Track different sets of Twitter accounts with separate configurations
- **Efficient batching**: Optimized Twitter API usage through account batching
- **Resilient architecture**: Circuit breakers and rate limiting to handle API restrictions
- **Performance monitoring**: Built-in metrics collection and health checks
- **Persistence**: State persistence for reliable operation across restarts
- **Configurable**: Flexible search windows, polling intervals, and notification settings

## Requirements

- Node.js 18+
- MongoDB
- Twitter API access (via rettiwt-api)
- Telegram Bot API token

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `.env` file with the following variables:
   ```
   # Twitter API
   TWITTER_API_KEY=your_twitter_api_key
   TWITTER_API_SECRET=your_twitter_api_secret
   
   # Telegram Bot
   TELEGRAM_BOT_TOKEN=your_telegram_bot_token
   TELEGRAM_GROUP_ID=your_telegram_group_id
   
   # MongoDB
   MONGODB_URI=mongodb://localhost:27017/tgnoti
   
   # Optional
   LOG_LEVEL=info
   QUIET_LOGGING=false
   ```
4. Build the project:
   ```
   npm run build
   ```

## Usage

### Start the service

```
npm start
```

### Development mode

```
npm run dev
```

### View monitoring dashboard

```
npm run dashboard
```

### Configuration

Configure topics and accounts in `src/config/topicConfig.ts`:

```typescript
export const topics: TopicConfig[] = [
  {
    id: 1,
    name: 'KOL_MONITORING',
    accounts: ['account1', 'account2'],
    searchWindowMinutes: 60
  },
  {
    id: 2,
    name: 'COMPETITOR_MENTIONS',
    mentions: ['competitor1', 'competitor2'],
    searchWindowMinutes: 120
  }
];
```

## Architecture

The application uses dependency injection (Inversify) with a service-oriented architecture:

- **Core Services**: Twitter monitoring, Telegram messaging, configuration management
- **Resilience Patterns**: Circuit breakers, rate limiters, error handlers
- **Persistence**: MongoDB for storing state and metrics
- **Monitoring**: Built-in metrics collection and health checks

## License

Proprietary. All rights reserved. This software is not available for public use, modification, or distribution without express written permission.

See the [LICENSE](LICENSE) file for details.