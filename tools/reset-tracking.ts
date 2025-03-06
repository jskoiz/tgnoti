#!/usr/bin/env ts-node-esm

import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const basePath = dirname(__dirname);

// Load environment variables
const envPath = `${basePath}/.env`;
console.log('Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

async function resetMongoDBTracking() {
  console.log('Resetting MongoDB tweet tracking...');
  
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable not set');
    return;
  }
  
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const tweetsCollection = db.collection('tweets');
    
    const result = await tweetsCollection.deleteMany({});
    console.log(`Deleted ${result.deletedCount} documents from tweets collection`);
    
  } catch (error) {
    console.error('Error resetting MongoDB tracking:', error);
    throw error;
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

async function main() {
  try {
    // Reset MongoDB tracking
    await resetMongoDBTracking();
    
    console.log('Tweet tracking reset complete. All tweets will now be treated as new.');
  } catch (error) {
    console.error('Failed to reset tweet tracking:', error);
    process.exit(1);
  }
}

main().catch(console.error);