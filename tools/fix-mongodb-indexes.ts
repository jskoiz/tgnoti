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

async function main() {
  console.log(`${colors.cyan}${colors.bright}MongoDB Index Repair Tool${colors.reset}`);
  console.log(`${colors.dim}This tool will fix index naming conflicts in MongoDB collections${colors.reset}\n`);

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

    // Fix indexes for each collection
    for (const [collectionKey, collectionName] of Object.entries(COLLECTIONS)) {
      console.log(`${colors.cyan}Checking indexes for collection: ${collectionName}${colors.reset}`);
      
      const collection = db.collection(collectionName);
      
      // Get existing indexes
      const indexes = await collection.indexes();
      console.log(`Found ${indexes.length} indexes in ${collectionName}`);
      
      // Check for conflicting indexes
      const indexKeyPatterns = new Map();
      const conflictingIndexes: Array<{
        keyPattern: string;
        existingName: string;
        conflictingName: string;
      }> = [];
      
      for (const index of indexes) {
        const keyPattern = JSON.stringify(index.key);
        
        // Skip _id_ index as it's special
        if (index.name === '_id_') continue;
        
        if (indexKeyPatterns.has(keyPattern)) {
          // Found a conflict
          conflictingIndexes.push({
            keyPattern,
            existingName: indexKeyPatterns.get(keyPattern),
            conflictingName: index.name
          });
        } else {
          indexKeyPatterns.set(keyPattern, index.name);
        }
      }
      
      if (conflictingIndexes.length === 0) {
        console.log(`${colors.green}No conflicting indexes found in ${collectionName}${colors.reset}`);
        continue;
      }
      
      console.log(`${colors.yellow}Found ${conflictingIndexes.length} conflicting indexes in ${collectionName}${colors.reset}`);
      
      // Drop conflicting indexes
      for (const conflict of conflictingIndexes) {
        console.log(`Dropping index with name: ${conflict.conflictingName}`);
        try {
          await collection.dropIndex(conflict.conflictingName);
          console.log(`${colors.green}Successfully dropped index: ${conflict.conflictingName}${colors.reset}`);
        } catch (error) {
          console.error(`${colors.red}Failed to drop index: ${conflict.conflictingName}${colors.reset}`, error);
        }
      }
    }
    
    // Special handling for tweets collection which has the id_1 index issue
    console.log(`\n${colors.cyan}Fixing specific index issues in tweets collection...${colors.reset}`);
    const tweetsCollection = db.collection(COLLECTIONS.tweets);
    
    try {
      // Check if id_1 index exists
      const indexes = await tweetsCollection.indexes();
      const idIndex = indexes.find(idx => idx.name === 'id_1');
      
      if (idIndex) {
        console.log(`Found problematic index 'id_1'. Dropping it...`);
        await tweetsCollection.dropIndex('id_1');
        console.log(`${colors.green}Successfully dropped index: id_1${colors.reset}`);
      } else {
        console.log(`Index 'id_1' not found, checking for idx_tweet_id...`);
        
        const idxTweetId = indexes.find(idx => idx.name === 'idx_tweet_id');
        if (!idxTweetId) {
          console.log(`Creating index 'idx_tweet_id' on tweets collection...`);
          await tweetsCollection.createIndex({ id: 1 }, { unique: true, name: 'idx_tweet_id' });
          console.log(`${colors.green}Successfully created index: idx_tweet_id${colors.reset}`);
        } else {
          console.log(`${colors.green}Index 'idx_tweet_id' already exists${colors.reset}`);
        }
      }
    } catch (error) {
      console.error(`${colors.red}Error fixing tweets collection indexes:${colors.reset}`, error);
    }
    
    // Create all required indexes for tweets collection
    console.log(`\n${colors.cyan}Creating required indexes for tweets collection...${colors.reset}`);
    try {
      await tweetsCollection.createIndexes([
        { key: { 'metadata.topicId': 1 }, name: 'idx_topic_id' },
        { key: { 'metadata.capturedAt': 1 }, name: 'idx_captured_at' },
        { key: { 'processingStatus.isAnalyzed': 1 }, name: 'idx_is_analyzed' },
        { key: { text: "text" }, name: 'idx_text_search' },
        { key: { 'tweetBy.userName': 1 }, name: 'idx_username' },
        { key: { 'metadata.capturedAt': -1, id: -1 }, name: 'idx_recent_tweets' },
        { key: { 'processingStatus.isAnalyzed': 1, 'processingStatus.attempts': 1 }, name: 'idx_processing_status' }
      ]);
      console.log(`${colors.green}Successfully created required indexes for tweets collection${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error creating indexes for tweets collection:${colors.reset}`, error);
    }
    
    // Create all required indexes for topic filters collection
    console.log(`\n${colors.cyan}Creating required indexes for topic_filters collection...${colors.reset}`);
    try {
      const topicFiltersCollection = db.collection(COLLECTIONS.topicFilters);
      await topicFiltersCollection.createIndexes([
        { key: { topicId: 1, filterType: 1, value: 1 }, unique: true, name: 'idx_unique_filter' },
        { key: { topicId: 1 }, name: 'idx_topic_filters' },
        { key: { filterType: 1, value: 1 }, name: 'idx_filter_lookup' }
      ]);
      console.log(`${colors.green}Successfully created required indexes for topic_filters collection${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error creating indexes for topic_filters collection:${colors.reset}`, error);
    }
    
    // Create indexes for monitor state collection
    console.log(`\n${colors.cyan}Creating required indexes for monitorState collection...${colors.reset}`);
    try {
      const monitorStateCollection = db.collection(COLLECTIONS.monitorState);
      await monitorStateCollection.createIndex({ type: 1 }, { unique: true, name: 'idx_monitor_state_type' });
      console.log(`${colors.green}Successfully created required indexes for monitorState collection${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error creating indexes for monitorState collection:${colors.reset}`, error);
    }
    
    // Create indexes for metrics snapshots collection
    console.log(`\n${colors.cyan}Creating required indexes for metricsSnapshots collection...${colors.reset}`);
    try {
      const metricsSnapshotsCollection = db.collection(COLLECTIONS.metricsSnapshots);
      await metricsSnapshotsCollection.createIndexes([
        { key: { timestamp: 1 }, name: 'idx_metrics_timestamp_asc' },
        { key: { timestamp: -1 }, name: 'idx_metrics_timestamp_desc' }
      ]);
      console.log(`${colors.green}Successfully created required indexes for metricsSnapshots collection${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error creating indexes for metricsSnapshots collection:${colors.reset}`, error);
    }
    
    // Create index for config collection
    console.log(`\n${colors.cyan}Creating required indexes for config collection...${colors.reset}`);
    try {
      const configCollection = db.collection(COLLECTIONS.config);
      await configCollection.createIndex({ type: 1 }, { unique: true, name: 'idx_config_type' });
      console.log(`${colors.green}Successfully created required indexes for config collection${colors.reset}`);
    } catch (error) {
      console.error(`${colors.red}Error creating indexes for config collection:${colors.reset}`, error);
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