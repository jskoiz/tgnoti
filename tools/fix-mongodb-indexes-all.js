#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// MongoDB connection string from environment variable
const MONGO_URI = process.env.MONGO_DB_STRING || '';
const DB_NAME = 'twitter_notifications';
const COLLECTIONS = {
  tweets: 'tweets',
  topicFilters: 'topic_filters',
  monitorState: 'monitorState',
  metricsSnapshots: 'metricsSnapshots',
  config: 'config'
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Define the expected indexes for each collection
const EXPECTED_INDEXES = {
  tweets: [
    { key: { id: 1 }, unique: true, name: 'idx_tweet_id' },
    { key: { 'metadata.topicId': 1 }, name: 'idx_topic_id' },
    { key: { 'metadata.capturedAt': 1 }, name: 'idx_captured_at' },
    { key: { 'processingStatus.isAnalyzed': 1 }, name: 'idx_is_analyzed' },
    { key: { text: "text" }, name: 'idx_text_search' },
    { key: { 'tweetBy.userName': 1 }, name: 'idx_username' },
    { key: { 'metadata.capturedAt': -1, id: -1 }, name: 'idx_recent_tweets' },
    { key: { 'processingStatus.isAnalyzed': 1, 'processingStatus.attempts': 1 }, name: 'idx_processing_status' }
  ],
  topic_filters: [
    { key: { topicId: 1, filterType: 1, value: 1 }, unique: true, name: 'idx_unique_filter' },
    { key: { topicId: 1 }, name: 'idx_topic_filters' },
    { key: { filterType: 1, value: 1 }, name: 'idx_filter_lookup' }
  ],
  monitorState: [
    { key: { type: 1 }, unique: true, name: 'idx_monitor_state_type' }
  ],
  metricsSnapshots: [
    { key: { timestamp: 1 }, name: 'idx_metrics_timestamp_asc' },
    { key: { timestamp: -1 }, name: 'idx_metrics_timestamp_desc' }
  ],
  config: [
    { key: { type: 1 }, unique: true, name: 'idx_config_type' }
  ]
};

// List of problematic index names to drop
const PROBLEMATIC_INDEXES = [
  'id_1',
  'metadata.topicId_1',
  'metadata.capturedAt_1',
  'processingStatus.isAnalyzed_1',
  'tweetBy.userName_1',
  'metadata.capturedAt_-1_id_-1',
  'processingStatus.isAnalyzed_1_processingStatus.attempts_1',
  'topicId_1_filterType_1_value_1',
  'topicId_1',
  'filterType_1_value_1',
  'type_1',
  'timestamp_1',
  'timestamp_-1'
];

async function main() {
  console.log(`${colors.cyan}${colors.bright}MongoDB Index Repair Tool (Complete)${colors.reset}`);
  console.log(`${colors.dim}This tool will fix all index naming conflicts in MongoDB collections${colors.reset}\n`);

  let client;
  try {
    if (!MONGO_URI) {
      throw new Error('MongoDB connection string not found in environment variables');
    }

    console.log(`${colors.cyan}Connecting to MongoDB...${colors.reset}`);
    client = await MongoClient.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      directConnection: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });

    const db = client.db(DB_NAME);
    console.log(`${colors.green}Connected to MongoDB successfully${colors.reset}\n`);

    // Process each collection
    for (const [collectionKey, collectionName] of Object.entries(COLLECTIONS)) {
      console.log(`${colors.cyan}Processing collection: ${collectionName}${colors.reset}`);
      
      const collection = db.collection(collectionName);
      
      // Get existing indexes
      const indexes = await collection.indexes();
      console.log(`Found ${indexes.length} indexes in ${collectionName}`);
      
      // Step 1: Drop all non-_id indexes
      for (const index of indexes) {
        // Skip _id_ index as it's special
        if (index.name === '_id_') continue;
        
        console.log(`Dropping index: ${index.name}`);
        try {
          await collection.dropIndex(index.name);
          console.log(`${colors.green}Successfully dropped index: ${index.name}${colors.reset}`);
        } catch (error) {
          console.error(`${colors.red}Failed to drop index: ${index.name}${colors.reset}`, error);
        }
      }
      
      // Step 2: Create all expected indexes
      if (EXPECTED_INDEXES[collectionName]) {
        console.log(`Creating expected indexes for ${collectionName}...`);
        try {
          // Create indexes one by one to avoid conflicts
          for (const indexDef of EXPECTED_INDEXES[collectionName]) {
            try {
              const { key, ...options } = indexDef;
              await collection.createIndex(key, options);
              console.log(`${colors.green}Created index: ${options.name}${colors.reset}`);
            } catch (error) {
              console.error(`${colors.red}Failed to create index: ${indexDef.name}${colors.reset}`, error);
            }
          }
        } catch (error) {
          console.error(`${colors.red}Error creating indexes for ${collectionName}:${colors.reset}`, error);
        }
      }
      
      console.log('');
    }
    
    console.log(`\n${colors.green}${colors.bright}✓ MongoDB index repair completed${colors.reset}`);
    
  } catch (error) {
    console.error(`\n${colors.red}Error during index repair:${colors.reset}`, error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log(`\n${colors.cyan}MongoDB connection closed${colors.reset}`);
    }
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
});