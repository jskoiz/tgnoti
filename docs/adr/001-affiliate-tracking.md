# ADR-001: Twitter Affiliate Tracking Implementation

## Status
Accepted

## Context
The Telegram bot currently monitors Twitter accounts and sends updates to specific Telegram topics. We need to extend this functionality to track affiliates of specified Twitter accounts, detect changes in these affiliates, and report them to a dedicated Telegram topic.

## Decision
We will implement affiliate tracking by:

1. Creating a new MongoDB collection to store affiliate data
2. Extending the Twitter service to fetch affiliate information
3. Creating a dedicated affiliate tracking service
4. Adding new Telegram bot commands for user interaction
5. Integrating with the existing monitoring system

## Consequences

### Positive
- Users will be able to monitor changes in Twitter account affiliations
- Historical data will provide insights into affiliate relationships over time
- The bot will become more versatile with additional monitoring capabilities
- The implementation leverages existing architecture patterns

### Negative
- Additional API calls to Twitter may impact rate limits
- Increased database storage requirements for tracking historical affiliate data
- Additional processing during monitoring intervals

## Technical Details

### Data Structure
We created a new MongoDB collection called `affiliates` with the following structure:

```typescript
interface AffiliateDocument {
  _id?: ObjectId;
  userId: string;         // Twitter user ID being tracked
  userName: string;       // Twitter username being tracked
  affiliates: {
    userId: string;       // Affiliate's Twitter user ID
    userName: string;     // Affiliate's Twitter username
    fullName: string;     // Affiliate's display name
    followersCount: number;
    followingsCount: number;
    isVerified: boolean;
    addedAt: Date;        // When this affiliate was first detected
    removedAt?: Date;     // When this affiliate was removed (if applicable)
    isActive: boolean;    // Whether this affiliate is currently active
  }[];
  lastChecked: Date;      // When affiliates were last checked
  metadata: {
    source: string;
    capturedAt: Date;
    version: number;
  };
}
```

### New Components
1. **Types**: New types in `src/types/affiliates.ts`
2. **Configuration**: Updates to `src/config/topicConfig.ts` to include tracked accounts
3. **Services**:
   - Updates to `MongoDBService` for affiliate data storage
   - New `TwitterAffiliateService` for fetching affiliate data
   - New `AffiliateTrackingService` for tracking and reporting changes

### Integration Points
1. The affiliate tracking runs during each existing monitoring interval
2. Changes are reported to Telegram topic ID 6545
3. Historical data is stored indefinitely

### User Commands
1. `/affiliates` - List all tracked accounts and their affiliate counts
2. `/account <username or ID>` - Show affiliates for a specific account
3. `/help` - Updated to include affiliate tracking commands

### Implementation Approach
We followed a phased implementation:
1. Foundation: Types and configuration
2. Core services: Database, Twitter API integration, tracking logic
3. User interface: Telegram bot commands and message formatting
4. Integration: Connected with existing monitoring system