#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

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
  cyan: '\x1b[36m'
};

/**
 * Main function to check MongoDB data integrity
 */
async function main() {
  console.log(`${colors.cyan}${colors.bright}MongoDB Data Integrity Check${colors.reset}`);
  console.log(`${colors.dim}Checking data integrity and validation...${colors.reset}\n`);

  let client;
  try {
    if (!MONGO_URI) {
      throw new Error('MongoDB connection string not found in environment variables');
    }

    console.log(`${colors.cyan}Initializing MongoDB connection...${colors.reset}`);
    client = await MongoClient.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      directConnection: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });

    const db = client.db(DB_NAME);
    console.log(`${colors.green}MongoDB connection established${colors.reset}\n`);

    // Run data integrity check
    console.log(`${colors.cyan}Running data integrity checks...${colors.reset}`);
    const result = await checkDataIntegrity(db);

    if (result.isValid) {
      console.log(`\n${colors.green}${colors.bright}✓ Data integrity check passed${colors.reset}`);
      console.log(`${colors.green}No issues found in the database${colors.reset}`);
    } else {
      console.log(`\n${colors.red}${colors.bright}✗ Data integrity check failed${colors.reset}`);
      console.log(`${colors.red}Found ${result.issues.length} issues:${colors.reset}`);
      
      result.issues.forEach((issue, index) => {
        console.log(`${colors.red}${index + 1}. ${issue}${colors.reset}`);
      });
      
      console.log(`\n${colors.yellow}Please fix these issues to ensure data integrity${colors.reset}`);
    }

    // Check collection statistics
    console.log(`\n${colors.cyan}Collecting database statistics...${colors.reset}`);

    // Get tweet count
    const tweetCount = await getTweetCount(db);
    console.log(`${colors.dim}Tweets: ${tweetCount}${colors.reset}`);

    // Get filter count
    const filterCount = await getFilterCount(db);
    console.log(`${colors.dim}Topic Filters: ${filterCount}${colors.reset}`);

    // Close MongoDB connection
    await client.close();
    console.log(`\n${colors.cyan}MongoDB connection closed${colors.reset}`);
    
    // Exit with appropriate code
    if (!result.isValid) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n${colors.red}Error during integrity check:${colors.reset}`, error);
    if (client) {
      await client.close();
    }
    process.exit(1);
  }
}

/**
 * Performs data integrity checks on the MongoDB collections
 * @param {Db} db The MongoDB database instance
 * @returns {Promise<{isValid: boolean, issues: string[]}>} Check results and issues
 */
async function checkDataIntegrity(db) {
  const issues = [];
  
  try {
    // Check tweets collection
    const tweetsCollection = db.collection(COLLECTIONS.tweets);
    
    // Check for tweets without required fields
    const invalidTweets = await tweetsCollection.countDocuments({
      $or: [
        { id: { $exists: false } },
        { text: { $exists: false } },
        { tweetBy: { $exists: false } },
        { 'metadata.topicId': { $exists: false } }
      ]
    });
    
    if (invalidTweets > 0) {
      issues.push(`Found ${invalidTweets} tweets with missing required fields`);
    }
    
    // Check for duplicate tweet IDs
    const duplicateTweetsPipeline = [
      { $group: { _id: '$id', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ];
    
    const duplicateTweets = await tweetsCollection.aggregate(duplicateTweetsPipeline).toArray();
    if (duplicateTweets.length > 0) {
      issues.push(`Found ${duplicateTweets.length} duplicate tweet IDs`);
    }
    
    // Check topic filters collection
    const topicFiltersCollection = db.collection(COLLECTIONS.topicFilters);
    
    // Check for filters without required fields
    const invalidFilters = await topicFiltersCollection.countDocuments({
      $or: [
        { topicId: { $exists: false } },
        { filterType: { $exists: false } },
        { value: { $exists: false } }
      ]
    });
    
    if (invalidFilters > 0) {
      issues.push(`Found ${invalidFilters} topic filters with missing required fields`);
    }
    
    // Check for invalid filter types
    const invalidFilterTypes = await topicFiltersCollection.countDocuments({
      filterType: { $nin: ['user', 'mention', 'keyword'] }
    });
    
    if (invalidFilterTypes > 0) {
      issues.push(`Found ${invalidFilterTypes} topic filters with invalid filter types`);
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  } catch (error) {
    console.error(`${colors.red}Error during data integrity check:${colors.reset}`, error);
    issues.push(`Error during integrity check: ${error.message}`);
    return {
      isValid: false,
      issues
    };
  }
}

/**
 * Get the total number of tweets in the database
 */
async function getTweetCount(db) {
  try {
    const tweetsCollection = db.collection(COLLECTIONS.tweets);
    return await tweetsCollection.countDocuments();
  } catch (error) {
    console.error(`${colors.yellow}Could not get tweet count:${colors.reset}`, error);
    return 'Unknown';
  }
}

/**
 * Get the total number of topic filters in the database
 */
async function getFilterCount(db) {
  try {
    const filtersCollection = db.collection(COLLECTIONS.topicFilters);
    return await filtersCollection.countDocuments();
  } catch (error) {
    console.error(`${colors.yellow}Could not get filter count:${colors.reset}`, error);
    return 'Unknown';
  }
}

// Run the main function
main().catch(error => {
  console.error(`${colors.red}Unhandled error:${colors.reset}`, error);
  process.exit(1);
});