#!/usr/bin/env node
import { MongoClient } from 'mongodb';
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// MongoDB connection string from environment variable
const MONGO_URI = process.env.MONGO_DB_STRING || '';
const DB_NAME = 'twitter_notifications';
const TOPIC_FILTERS_COLLECTION = 'topic_filters';

// SQLite database path
const SQLITE_DB_PATH = path.join(process.cwd(), 'affiliate_data.db');

async function migrateTopicFilters() {
  console.log('Migrating topic filters from SQLite to MongoDB...');
  
  if (!MONGO_URI) {
    console.error('MongoDB connection string not found in environment variables');
    process.exit(1);
  }
  
  let mongoClient: MongoClient | null = null;
  let sqliteDb: Database | null = null;
  
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    mongoClient = await MongoClient.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      directConnection: false,
      tls: true,
      tlsAllowInvalidCertificates: false,
      tlsAllowInvalidHostnames: false
    });
    
    console.log('Connected to MongoDB successfully');
    
    // Connect to SQLite
    console.log('Connecting to SQLite...');
    sqliteDb = new sqlite3.Database(SQLITE_DB_PATH);
    
    // Get topic filters from SQLite
    const topicFilters = await queryTopicFilters(sqliteDb);
    console.log(`Found ${topicFilters.length} topic filters in SQLite`);
    
    if (topicFilters.length === 0) {
      console.log('No topic filters to migrate');
      return;
    }
    
    // Get MongoDB database and collection
    const db = mongoClient.db(DB_NAME);
    const collection = db.collection(TOPIC_FILTERS_COLLECTION);
    
    // Check if collection exists
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    if (!collectionNames.includes(TOPIC_FILTERS_COLLECTION)) {
      console.log(`Creating ${TOPIC_FILTERS_COLLECTION} collection...`);
      await db.createCollection(TOPIC_FILTERS_COLLECTION);
    }
    
    // Create index on topic_id, filter_type, value
    await collection.createIndex(
      { topicId: 1, filterType: 1, value: 1 },
      { unique: true }
    );
    
    // Migrate topic filters
    console.log('Migrating topic filters...');
    let migratedCount = 0;
    let skippedCount = 0;
    
    for (const filter of topicFilters) {
      try {
        // Check if filter already exists
        const existingFilter = await collection.findOne({
          topicId: filter.topic_id,
          filterType: filter.filter_type,
          value: filter.value
        });
        
        if (existingFilter) {
          console.log(`Filter already exists: ${filter.filter_type}:${filter.value} for topic ${filter.topic_id}`);
          skippedCount++;
          continue;
        }
        
        // Insert filter
        await collection.insertOne({
          topicId: filter.topic_id,
          filterType: filter.filter_type,
          value: filter.value,
          createdAt: new Date(filter.created_at),
          createdBy: filter.created_by
        });
        
        migratedCount++;
        
        if (migratedCount % 10 === 0) {
          console.log(`Migrated ${migratedCount} filters so far...`);
        }
      } catch (error) {
        console.error(`Failed to migrate filter ${filter.id}:`, error);
      }
    }
    
    console.log(`Migration completed: ${migratedCount} filters migrated, ${skippedCount} filters skipped`);
    
    // Verify migration
    const migratedFilters = await collection.find().toArray();
    console.log(`Total filters in MongoDB: ${migratedFilters.length}`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close connections
    if (mongoClient) {
      await mongoClient.close();
      console.log('MongoDB connection closed');
    }
    
    if (sqliteDb) {
      sqliteDb.close();
      console.log('SQLite connection closed');
    }
  }
}

// Helper function to query topic filters from SQLite
function queryTopicFilters(db: Database): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM topic_filters', (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Run the migration
migrateTopicFilters().catch(console.error);