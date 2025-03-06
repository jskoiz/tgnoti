#!/usr/bin/env node
import { MongoClient, Db, Collection } from 'mongodb';
import { createInterface } from 'node:readline';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

// MongoDB connection string from environment variable
const MONGO_URI = process.env.MONGO_DB_STRING || '';
const DB_NAME = 'twitter_notifications';
const COLLECTIONS = {
  tweets: 'tweets',
  topicFilters: 'topic_filters',
  monitorState: 'monitorState',
  metricsSnapshots: 'metricsSnapshots'
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
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Operation types to monitor
const OPERATIONS = {
  insert: 'insert',
  update: 'update',
  delete: 'delete',
  find: 'find',
  aggregate: 'aggregate',
  count: 'count'
};

// Statistics for operations
interface OperationStats {
  count: number;
  lastExecuted: Date | null;
  avgExecutionTime: number;
  totalExecutionTime: number;
}

interface CollectionStats {
  documentCount: number;
  sizeBytes: number;
  [operation: string]: OperationStats | number;
}
 
interface DatabaseStats {
  startTime: Date;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastError: string | null;
  [collection: string]: CollectionStats | Date | string | null;
}

// Initialize statistics
const stats = {
  startTime: new Date(),
  connectionStatus: 'disconnected',
  lastError: null
};

// Initialize stats for each collection
Object.values(COLLECTIONS).forEach(collection => {
  stats[collection] = <CollectionStats>{
    documentCount: 0,
    sizeBytes: 0
  };
  
  // Initialize operation stats for each collection
  Object.values(OPERATIONS).forEach(operation => {
    (stats[collection] as CollectionStats)[operation] = {
      count: 0,
      lastExecuted: null,
      avgExecutionTime: 0,
      totalExecutionTime: 0
    };
  });
});

// Function to connect to MongoDB
async function connectToMongoDB(): Promise<MongoClient> {
  if (!MONGO_URI) {
    throw new Error('MongoDB connection string not found in environment variables');
  }
  
  console.log(`${colors.cyan}Connecting to MongoDB...${colors.reset}`);
  
  try {
    const client = await MongoClient.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      directConnection: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    
    stats.connectionStatus = 'connected';
    console.log(`${colors.green}Connected to MongoDB successfully${colors.reset}`);
    return client;
  } catch (error) {
    stats.connectionStatus = 'error';
    stats.lastError = error instanceof Error ? error.message : String(error) as any;
    console.error(`${colors.red}Failed to connect to MongoDB:${colors.reset}`, error);
    throw error;
  }
}

// Function to get collection stats
async function getCollectionStats(db: Db, collectionName: string): Promise<void> {
  try {
    const collection = db.collection(collectionName);
    const collStats = await db.command({ collStats: collectionName });
    
    stats[collectionName].documentCount = await collection.countDocuments();
    stats[collectionName].sizeBytes = collStats.size || 0;
  } catch (error) {
    console.error(`${colors.red}Error getting stats for collection ${collectionName}:${colors.reset}`, error);
  }
}

// Function to update operation stats
function updateOperationStats(
  collectionName: string, 
  operation: string, 
  executionTime: number
): void {
  const opStats = (stats[collectionName] as CollectionStats)[operation] as OperationStats;
  opStats.count++;
  opStats.lastExecuted = new Date();
  opStats.totalExecutionTime += executionTime;
  opStats.avgExecutionTime = opStats.totalExecutionTime / opStats.count;
}

// Function to monitor MongoDB operations using profiler
async function setupProfiler(db: Db): Promise<void> {
  try {
    // Set profiling level to log all operations
    await db.command({ profile: 2, slowms: 0 });
    console.log(`${colors.green}Profiling enabled for all operations${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error setting up profiler:${colors.reset}`, error);
    console.log(`${colors.yellow}Falling back to manual monitoring${colors.reset}`);
  }
}

// Function to check recent operations from system.profile collection
async function checkRecentOperations(db: Db): Promise<void> {
  try {
    const profileCollection = db.collection('system.profile');
    const operations = await profileCollection
      .find({}, { sort: { ts: -1 }, limit: 100 })
      .toArray();
    
    operations.forEach(op => {
      const collectionName = op.ns.split('.')[1];
      if (Object.values(COLLECTIONS).includes(collectionName)) {
        const operationType = op.op.toLowerCase();
        if (stats[collectionName] && (stats[collectionName] as CollectionStats)[operationType]) {
          updateOperationStats(collectionName, operationType, op.millis);
        }
      }
    });
  } catch (error) {
    console.error(`${colors.red}Error checking recent operations:${colors.reset}`, error);
  }
}

// Function to check tweet storage
async function checkTweetStorage(db: Db): Promise<void> {
  try {
    const tweetsCollection = db.collection(COLLECTIONS.tweets);
    
    // Get the most recent tweets
    const recentTweets = await tweetsCollection
      .find({}, { sort: { 'metadata.capturedAt': -1 }, limit: 5 })
      .toArray();
    
    console.log(`\n${colors.cyan}Recent Tweet Storage Check:${colors.reset}`);
    
    if (recentTweets.length === 0) {
      console.log(`${colors.yellow}No tweets found in the database${colors.reset}`);
      return;
    }
    
    console.log(`${colors.green}Found ${recentTweets.length} recent tweets${colors.reset}`);
    
    // Check if tweets have all required fields
    const requiredFields = ['id', 'text', 'metadata', 'processingStatus'];
    const missingFields: Record<string, string[]> = {};
    
    recentTweets.forEach(tweet => {
      const missing = requiredFields.filter(field => !tweet[field]);
      if (missing.length > 0) {
        missingFields[tweet.id] = missing;
      }
    });
    
    if (Object.keys(missingFields).length > 0) {
      console.log(`${colors.red}Some tweets are missing required fields:${colors.reset}`);
      console.log(missingFields);
    } else {
      console.log(`${colors.green}All tweets have required fields${colors.reset}`);
    }
    
    // Sample tweet data (first tweet)
    const sampleTweet = recentTweets[0];
    console.log(`\n${colors.cyan}Sample Tweet:${colors.reset}`);
    console.log(`ID: ${sampleTweet.id}`);
    console.log(`Text: ${sampleTweet.text.substring(0, 50)}${sampleTweet.text.length > 50 ? '...' : ''}`);
    console.log(`Topic ID: ${sampleTweet.metadata.topicId}`);
    console.log(`Captured At: ${sampleTweet.metadata.capturedAt}`);
    console.log(`Analyzed: ${sampleTweet.processingStatus.isAnalyzed}`);
  } catch (error) {
    console.error(`${colors.red}Error checking tweet storage:${colors.reset}`, error);
  }
}

// Function to display statistics
function displayStats(): void {
  console.clear();
  
  const now = new Date();
  const uptime = (now.getTime() - stats.startTime.getTime()) / 1000; // in seconds
  
  console.log(`\n${colors.bright}${colors.cyan}MongoDB Operations Monitor${colors.reset}`);
  console.log(`${colors.dim}Started: ${stats.startTime.toLocaleString()}${colors.reset}`);
  console.log(`${colors.dim}Uptime: ${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s${colors.reset}`);
  console.log(`${colors.dim}Connection Status: ${stats.connectionStatus === 'connected' ? colors.green + 'Connected' : colors.red + 'Disconnected'}${colors.reset}`);
  
  if (stats.lastError) {
    console.log(`${colors.red}Last Error: ${stats.lastError}${colors.reset}`);
  }
  
  console.log('\n');
  
  // Display collection stats
  Object.values(COLLECTIONS).forEach(collectionName => {
    const collStats = stats[collectionName] as CollectionStats;
    
    console.log(`${colors.bright}${colors.cyan}Collection: ${collectionName}${colors.reset}`);
    console.log(`${colors.dim}Documents: ${collStats.documentCount}${colors.reset}`);
    console.log(`${colors.dim}Size: ${(collStats.sizeBytes as number / 1024 / 1024).toFixed(2)} MB${colors.reset}`);
    
    console.log(`\n${colors.bright}Operations:${colors.reset}`);
    
    // Display operation stats
    Object.values(OPERATIONS).forEach(operation => {
      const opStats = collStats[operation] as OperationStats;
      if (opStats && opStats.count > 0) {
        console.log(`  ${colors.yellow}${operation}:${colors.reset} ${opStats.count} operations`);
        console.log(`    ${colors.dim}Last executed: ${opStats.lastExecuted ? opStats.lastExecuted.toLocaleString() : 'Never'}${colors.reset}`);
        console.log(`    ${colors.dim}Avg execution time: ${opStats.avgExecutionTime.toFixed(2)} ms${colors.reset}`);
      }
    });
    
    console.log('\n');
  });
  
  console.log(`${colors.dim}Press Ctrl+C to exit${colors.reset}`);
}

// Main function
async function main(): Promise<void> {
  try {
    const client = await connectToMongoDB();
    const db = client.db(DB_NAME);
    
    // Setup profiler if possible
    await setupProfiler(db);
    
    // Initial collection stats
    for (const collectionName of Object.values(COLLECTIONS)) {
      await getCollectionStats(db, collectionName);
    }
    
    // Check tweet storage
    await checkTweetStorage(db);
    
    // Display initial stats
    displayStats();
    
    // Setup interval to update stats
    setInterval(async () => {
      // Update collection stats
      for (const collectionName of Object.values(COLLECTIONS)) {
        await getCollectionStats(db, collectionName);
      }
      
      // Check recent operations
      await checkRecentOperations(db);
      
      // Check tweet storage periodically (every 5 updates)
      if (Math.floor(Date.now() / 1000) % 5 === 0) {
        await checkTweetStorage(db);
      }
      
      // Update display
      displayStats();
    }, 2000);
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log(`\n${colors.yellow}Closing MongoDB connection...${colors.reset}`);
      await client.close();
      console.log(`${colors.green}MongoDB connection closed${colors.reset}`);
      process.exit(0);
    });
    
    // Create readline interface for user input
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.on('line', async (input) => {
      if (input.trim().toLowerCase() === 'check') {
        await checkTweetStorage(db);
        setTimeout(() => displayStats(), 3000);
      }
    });
    
  } catch (error) {
    console.error(`${colors.red}Error in main function:${colors.reset}`, error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
});