#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Load environment variables
dotenv.config();

// MongoDB connection string from environment variable
const MONGO_URI = process.env.MONGO_DB_STRING || '';
const DB_NAME = 'twitter_notifications';
const CONFIG_COLLECTION = 'config';

async function initializeConfig() {
  console.log('Initializing MongoDB config collection...');
  
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
    
    // Create config collection if it doesn't exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    if (!collectionNames.includes(CONFIG_COLLECTION)) {
      console.log(`Creating ${CONFIG_COLLECTION} collection...`);
      await db.createCollection(CONFIG_COLLECTION);
    }
    
    // Get sensitive data from environment variables
    const bearerToken = process.env.BEARER_TOKEN || '';
    const botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const groupId = process.env.TELEGRAM_GROUP_ID || '';
    
    // Create default config
    const config = {
      type: 'appConfig',
      twitter: {
        bearerToken,
        searchQueries: {},
        pollingInterval: 60000
      },
      telegram: {
        botToken,
        groupId,
        defaultTopicId: 'default',
        retryAttempts: 3,
        topics: {},
        topicIds: {}
      },
      updatedAt: new Date()
    };
    
    // Save config to MongoDB
    const configCollection = db.collection(CONFIG_COLLECTION);
    
    // Check if config already exists
    const existingConfig = await configCollection.findOne({ type: 'appConfig' });
    
    if (existingConfig) {
      console.log('Config already exists, updating...');
      await configCollection.updateOne(
        { type: 'appConfig' },
        { $set: config }
      );
    } else {
      console.log('Creating new config...');
      await configCollection.insertOne(config);
    }
    
    console.log('Config initialized successfully');
    
    // Verify config
    const savedConfig = await configCollection.findOne({ type: 'appConfig' });
    console.log('Saved config:');
    console.log(JSON.stringify(savedConfig, null, 2));
    
  } catch (error) {
    console.error('Failed to initialize config:', error);
  } finally {
    // Close MongoDB connection
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the initialization
initializeConfig().catch(console.error);