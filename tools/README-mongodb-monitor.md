# MongoDB Operations Monitor

This tool allows you to monitor the read/write operations to MongoDB to ensure tweets are being properly stored and retrieved.

## Features

- Real-time monitoring of MongoDB operations
- Collection statistics (document count, size)
- Operation tracking (inserts, updates, deletes, finds, etc.)
- Tweet storage validation
- Performance metrics (execution time)

## Prerequisites

- Node.js installed
- MongoDB connection string in `.env` file
- Required npm packages: `mongodb`, `dotenv`

## Usage

### JavaScript Version

```bash
node tools/monitor-mongodb-operations.js
```

or

```bash
NODE_NO_WARNINGS=1 node tools/monitor-mongodb-operations.js
```

### TypeScript Version

```bash
ts-node tools/monitor-mongodb-operations.ts
```
or

```bash
NODE_NO_WARNINGS=1 node --loader ts-node/esm tools/monitor-mongodb-operations.ts
```

Note: This project uses ES modules, so the commands above are configured to work with the ES module system.
## Interactive Commands

While the monitor is running, you can use the following commands:

- Type `check` and press Enter to manually check tweet storage
- Press Ctrl+C to exit the monitor

## What It Monitors

### Collections

- `tweets`: Stores all tweet data with metadata
- `topicFilters`: Stores topic filter configurations
- `monitorState`: Stores the state of the monitoring system
- `metricsSnapshots`: Stores historical metrics data

### Operations

For each collection, the tool tracks:

- `insert`: Document insertions
- `update`: Document updates
- `delete`: Document deletions
- `find`: Document queries
- `aggregate`: Aggregation operations
- `count`: Count operations

### Tweet Storage Validation

The tool periodically checks:

- If tweets are being stored with all required fields
- The structure of stored tweets
- Sample tweet data to verify content

## How It Works

1. Connects to MongoDB using the connection string from `.env`
2. Sets up profiling to track operations (if permissions allow)
3. Collects initial statistics for all collections
4. Periodically checks for new operations and updates statistics
5. Displays real-time information in the console
6. Validates tweet storage to ensure data integrity

## Troubleshooting

If you encounter issues:

1. Verify your MongoDB connection string in `.env`
2. Ensure you have the necessary permissions to enable profiling
3. Check that the required collections exist in the database
4. Verify that the MongoDB user has read permissions

## Notes

- The profiler may require admin privileges to enable. If it fails, the tool will fall back to manual monitoring.
- The tool refreshes statistics every 2 seconds.
- Tweet storage validation occurs every 10 seconds.