# MongoDB Migration Guide

This guide explains how to migrate from the dual-database approach (SQLite + MongoDB) to using MongoDB exclusively.

## Overview

The system currently uses a dual-database approach:
- **SQLite**: Used for topic filters, tweet tracking (seen tweets), and configuration
- **MongoDB**: Used for complete tweet storage, sentiment analysis, monitor state, and metrics

This migration simplifies the architecture, improves consistency, and enhances scalability by using MongoDB as the sole database for all storage needs.

## Migration Steps

### Automated Migration

#### 1. Prerequisites

- Ensure MongoDB is properly configured with a valid connection string in your `.env` file:
  ```
  MONGO_DB_STRING=mongodb+srv://username:password@cluster.mongodb.net/twitter_notifications
  ```

- Make sure you have the latest code with MongoDB migration changes
- Ensure your `.env` file has all required environment variables

#### 2. Run the Master Migration Script

The master migration script will run all migration steps in sequence:

```bash
# Run the master migration script
node --loader ts-node/esm tools/migrate-to-mongodb.ts
```

This script will:
1. Initialize the MongoDB config collection
2. Migrate topic filters from SQLite to MongoDB
3. Migrate tracked tweets from SQLite to MongoDB

#### 3. Verify Migration

After running the migration script, verify that all data has been properly migrated:

```bash
# Check MongoDB collections
node --loader ts-node/esm tools/simple-mongodb-test.ts
```

### Manual Migration

If you prefer to run the migration steps manually, you can run each script individually:

```bash
# Initialize MongoDB config
node --loader ts-node/esm tools/init-mongodb-config.ts

# Migrate topic filters
node --loader ts-node/esm tools/migrate-topic-filters.ts

# Migrate tracked tweets
node --loader ts-node/esm tools/migrate-tracked-tweets.ts
```

### 4. Backup SQLite Database (Optional)

Once you've verified the migration was successful, you can backup and remove the SQLite database:

```bash
# Backup SQLite database
cp affiliate_data.db affiliate_data.db.bak

# Remove SQLite database (optional, only after successful migration)
# rm affiliate_data.db
```

## Migration Scripts

The following migration scripts are available:

1. **migrate-to-mongodb.ts**: Master migration script that runs all steps in sequence
2. **init-mongodb-config.ts**: Initializes the MongoDB config collection
3. **migrate-topic-filters.ts**: Migrates topic filters from SQLite to MongoDB
4. **migrate-tracked-tweets.ts**: Migrates tracked tweets from SQLite to MongoDB
5. **simple-mongodb-test.ts**: Tests the MongoDB connection and verifies migration

## Implementation Details

The migration process involves the following changes to the codebase:

1. **ConfigStorage**: New class for storing configuration in MongoDB
2. **MongoDBService**: Enhanced with methods for config storage and topic filters
3. **Storage**: Updated to use MongoDB exclusively
4. **ConfigService**: Modified to load configuration from MongoDB
5. **Container**: Updated to remove SQLite dependencies

## Benefits

- **Simplified Architecture**: Single database for all storage needs
- **Improved Consistency**: No data synchronization issues between databases
- **Better Scalability**: MongoDB Atlas provides automatic scaling
- **Enhanced Query Capabilities**: MongoDB's rich query language for analytics
- **Reduced Maintenance**: Only one database system to maintain
- **Cloud-Based**: MongoDB Atlas provides managed database services
- **Sentiment Analysis Ready**: MongoDB is already set up for sentiment analysis

## Troubleshooting

If you encounter issues during migration:

1. **Connection Issues**: Verify your MongoDB connection string in the `.env` file
2. **Missing Data**: Run the individual migration scripts to see detailed error messages
3. **Performance Issues**: Check MongoDB Atlas metrics and consider upgrading your cluster

For any persistent issues, check the logs for detailed error messages.