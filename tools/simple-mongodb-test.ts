#!/usr/bin/env node
import { MongoClient, Collection } from 'mongodb';
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

async function testMongoDB() {
  console.log('Testing MongoDB connection...');
  
  if (!MONGO_URI) {
    console.error('MongoDB connection string not found in environment variables');
    process.exit(1);
  }
  
  let client: MongoClient | null = null;
  
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    client = await MongoClient.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      directConnection: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    
    console.log('Connected to MongoDB successfully');
    
    // Get database
    const db = client.db(DB_NAME);
    
    // Test collections
    console.log('\nTesting collections:');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    for (const [key, name] of Object.entries(COLLECTIONS)) {
      if (collectionNames.includes(name)) {
        console.log(`✓ Collection ${name} exists`);
        
        // Count documents
        const count = await db.collection(name).countDocuments();
        console.log(`  - Contains ${count} documents`);
        
        // Sample document
        if (count > 0) {
          const sample = await db.collection(name).findOne({});
          console.log(`  - Sample document: ${JSON.stringify(sample, null, 2).substring(0, 150)}...`);
        }
      } else {
        console.log(`✗ Collection ${name} does not exist`);
      }
    }
    
    // Test config collection specifically
    console.log('\nTesting config collection:');
    const configCollection = db.collection(COLLECTIONS.config);
    const configDoc = await configCollection.findOne({ type: 'appConfig' });
    
    if (configDoc) {
      console.log('✓ Configuration document found');
      const { _id, type, ...config } = configDoc;
      
      // Check for sensitive data (just presence, not actual values)
      console.log(`  - Twitter bearer token: ${config.twitter?.bearerToken ? '✓ Present' : '✗ Missing'}`);
      console.log(`  - Telegram bot token: ${config.telegram?.botToken ? '✓ Present' : '✗ Missing'}`);
      console.log(`  - Telegram group ID: ${config.telegram?.groupId ? '✓ Present' : '✗ Missing'}`);
    } else {
      console.log('✗ No configuration document found');
    }
    
    // Test topic filters
    console.log('\nTesting topic filters:');
    const topicFiltersCollection = db.collection(COLLECTIONS.topicFilters);
    const topicFilters = await topicFiltersCollection.find().limit(5).toArray();
    
    if (topicFilters.length > 0) {
      console.log(`✓ Found ${topicFilters.length} topic filters`);
      console.log(`  - Sample filter: ${JSON.stringify(topicFilters[0], null, 2)}`);
    } else {
      console.log('✗ No topic filters found');
    }
    
    // Test tweets
    console.log('\nTesting tweets:');
    const tweetsCollection = db.collection(COLLECTIONS.tweets);
    const tweets = await tweetsCollection.find().limit(5).toArray();
    
    if (tweets.length > 0) {
      console.log(`✓ Found ${tweets.length} tweets`);
      console.log(`  - Sample tweet ID: ${tweets[0].id}`);
      console.log(`  - Sample tweet text: ${tweets[0].text.substring(0, 50)}...`);
    } else {
      console.log('✗ No tweets found');
    }
    
    console.log('\nMongoDB test completed successfully');
  } catch (error) {
    console.error('MongoDB test failed:', error);
  } finally {
    // Close MongoDB connection
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the test
testMongoDB().catch(console.error);