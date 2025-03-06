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
const TWEETS_COLLECTION = 'tweets';

// SQLite database path
const SQLITE_DB_PATH = path.join(process.cwd(), 'affiliate_data.db');

async function migrateTrackedTweets() {
  console.log('Migrating tracked tweets from SQLite to MongoDB...');
  
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
    
    // Get tracked tweets from SQLite
    const trackedTweets = await queryTrackedTweets(sqliteDb);
    console.log(`Found ${trackedTweets.length} tracked tweets in SQLite`);
    
    if (trackedTweets.length === 0) {
      console.log('No tracked tweets to migrate');
      return;
    }
    
    // Get MongoDB database and collection
    const db = mongoClient.db(DB_NAME);
    const collection = db.collection(TWEETS_COLLECTION);
    
    // Check if collection exists
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    if (!collectionNames.includes(TWEETS_COLLECTION)) {
      console.log(`Creating ${TWEETS_COLLECTION} collection...`);
      await db.createCollection(TWEETS_COLLECTION);
      
      // Create indexes
      await collection.createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { 'metadata.topicId': 1 }, unique: false },
        { key: { 'metadata.capturedAt': 1 }, unique: false },
        { key: { 'processingStatus.isAnalyzed': 1 }, unique: false }
      ]);
    }
    
    // Migrate tracked tweets
    console.log('Migrating tracked tweets...');
    let migratedCount = 0;
    let skippedCount = 0;
    
    // Process in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < trackedTweets.length; i += batchSize) {
      const batch = trackedTweets.slice(i, i + batchSize);
      
      for (const tweet of batch) {
        try {
          // Check if tweet already exists
          const existingTweet = await collection.findOne({ id: tweet.tweet_id });
          
          if (existingTweet) {
            // Tweet exists, check if it has the same topic ID
            if (existingTweet.metadata?.topicId === tweet.topic_id) {
              skippedCount++;
              continue;
            }
            
            // Tweet exists but with a different topic ID, update it
            await collection.updateOne(
              { id: tweet.tweet_id },
              { $set: { 'metadata.topicId': tweet.topic_id } }
            );
            
            migratedCount++;
            continue;
          }
          
          // Create a minimal tweet document
          const tweetDoc = {
            id: tweet.tweet_id,
            text: '[Migrated from SQLite]',
            createdAt: new Date(tweet.timestamp).toISOString(),
            tweetBy: {
              userName: 'system',
              displayName: 'System',
              fullName: 'System',
              followersCount: 0,
              followingCount: 0,
              statusesCount: 0,
              verified: false,
              isVerified: false,
              createdAt: new Date().toISOString()
            },
            replyCount: 0,
            retweetCount: 0,
            likeCount: 0,
            viewCount: 0,
            metadata: {
              source: 'sqlite_migration',
              topicId: tweet.topic_id,
              capturedAt: new Date(tweet.timestamp),
              version: 1
            },
            processingStatus: {
              isAnalyzed: false,
              attempts: 0
            }
          };
          
          // Insert tweet
          await collection.insertOne(tweetDoc);
          
          migratedCount++;
          
          if (migratedCount % 100 === 0) {
            console.log(`Migrated ${migratedCount} tweets so far...`);
          }
        } catch (error) {
          console.error(`Failed to migrate tweet ${tweet.tweet_id}:`, error);
        }
      }
      
      console.log(`Processed ${i + batch.length} of ${trackedTweets.length} tweets...`);
    }
    
    console.log(`Migration completed: ${migratedCount} tweets migrated, ${skippedCount} tweets skipped`);
    
    // Verify migration
    const migratedTweets = await collection.countDocuments();
    console.log(`Total tweets in MongoDB: ${migratedTweets}`);
    
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

// Helper function to query tracked tweets from SQLite
function queryTrackedTweets(db: Database): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM tracked_tweets', (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Run the migration
migrateTrackedTweets().catch(console.error);