# MongoDB Data Integrity Check Tool

This tool performs comprehensive data integrity checks on your MongoDB database to ensure data consistency and validity.

## Features

- Validates the structure of stored documents
- Checks for missing required fields
- Identifies duplicate entries
- Verifies index integrity
- Reports detailed statistics about your database
- Provides clear error messages for any issues found

## Prerequisites

- Node.js installed
- MongoDB connection string in `.env` file
- Required npm packages: `mongodb`, `dotenv`, `inversify`

## Usage

```bash
node tools/check-mongodb-integrity.js
```

or

```bash
NODE_NO_WARNINGS=1 node --loader ts-node/esm tools/check-mongodb-integrity.js
```

## What It Checks

### Tweet Documents

- Presence of required fields (id, text, tweetBy)
- Proper structure of metadata
- Proper structure of processing status
- Duplicate tweet IDs
- Invalid data types

### Topic Filters

- Presence of required fields (topicId, filterType, value)
- Valid filter types (user, mention, keyword)
- Duplicate filters
- Invalid data types

### Monitor State

- Presence of required fields
- Valid data types
- Proper structure

### Metrics Snapshots

- Presence of required fields
- Valid data types
- Proper structure

## Understanding the Results

The tool will output:

1. Connection status to MongoDB
2. Results of data integrity checks
3. List of any issues found
4. Database statistics (document counts)

### Example Output (Success)

```
MongoDB Data Integrity Check
Checking data integrity and validation...

Initializing MongoDB connection...
MongoDB connection established

Running data integrity checks...

✓ Data integrity check passed
No issues found in the database

Collecting database statistics...
Tweets: 1250
Topic Filters: 45

MongoDB connection closed
```

### Example Output (Issues Found)

```
MongoDB Data Integrity Check
Checking data integrity and validation...

Initializing MongoDB connection...
MongoDB connection established

Running data integrity checks...

✗ Data integrity check failed
Found 2 issues:
1. Found 3 tweets with missing required fields
2. Found 1 duplicate tweet ID

Please fix these issues to ensure data integrity

Collecting database statistics...
Tweets: 1250
Topic Filters: 45

MongoDB connection closed
```

## Recommended Usage

### Regular Checks

Run this tool regularly to ensure your database maintains its integrity:

- After major data migrations
- After system updates
- As part of your regular maintenance schedule
- When troubleshooting data-related issues

### Automated Monitoring

You can integrate this tool into your monitoring system to automatically check data integrity:

```bash
# Example cron job to run weekly checks
0 0 * * 0 cd /path/to/project && node tools/check-mongodb-integrity.js >> logs/integrity-check.log 2>&1
```

## Troubleshooting

If the tool reports issues:

1. Review the specific error messages to understand the problem
2. Use the MongoDB monitoring tool (`tools/monitor-mongodb-operations.js`) to inspect the problematic documents
3. Fix the issues using the MongoDB shell or a MongoDB management tool
4. Run the integrity check again to verify the fixes

## Related Tools

- `mongodb-backup.js`: Backup and restore your MongoDB database
- `monitor-mongodb-operations.js`: Monitor MongoDB operations in real-time