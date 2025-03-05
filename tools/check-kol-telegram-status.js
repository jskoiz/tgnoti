#!/usr/bin/env node

import { MongoClient } from 'mongodb';
import sqlite3 from 'sqlite3';
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

async function checkSQLiteTracking(tweetIds) {
  return new Promise((resolve, reject) => {
    console.log('Checking SQLite tweet tracking database...');
    const dbPath = path.join(basePath, 'affiliate_data.db');
    const db = new sqlite3.Database(dbPath);
    
    // Create placeholders for the query
    const placeholders = tweetIds.map(() => '?').join(',');
    const query = `SELECT tweet_id, topic_id FROM tracked_tweets WHERE tweet_id IN (${placeholders})`;
    
    db.all(query, tweetIds, (err, rows) => {
      if (err) {
        console.error('Error querying tracked_tweets table:', err);
        db.close();
        reject(err);
        return;
      }
      
      db.close((closeErr) => {
        if (closeErr) {
          console.error('Error closing SQLite database:', closeErr);
          reject(closeErr);
          return;
        }
        resolve(rows);
      });
    });
  });
}

async function checkKolTelegramStatus() {
  console.log('Checking KOL tweets Telegram status...');
  
  const mongoUri = process.env.MONGO_DB_STRING;
  if (!mongoUri) {
    console.error('MONGO_DB_STRING environment variable not set');
    return;
  }
  
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('twitter_notifications');
    const tweetsCollection = db.collection('tweets');
    
    // Get recent KOL tweets
    const recentKolTweets = await tweetsCollection
      .find({ 'metadata.topicId': '6531' })
      .sort({ 'metadata.capturedAt': -1 })
      .limit(10)
      .toArray();
    
    if (recentKolTweets.length === 0) {
      console.log('No KOL tweets found in MongoDB.');
      return;
    }
    
    console.log(`Found ${recentKolTweets.length} recent KOL tweets in MongoDB.`);
    
    // Extract tweet IDs
    const tweetIds = recentKolTweets.map(tweet => tweet.id);
    
    // Check if these tweets are marked as seen in SQLite
    const trackedTweets = await checkSQLiteTracking(tweetIds);
    
    console.log(`Found ${trackedTweets.length} of these tweets in SQLite tracking database.`);
    
    // Create a map of tracked tweets for easy lookup
    const trackedTweetsMap = {};
    trackedTweets.forEach(row => {
      trackedTweetsMap[row.tweet_id] = row.topic_id;
    });
    
    // Display status for each tweet
    console.log('\nTweet status:');
    recentKolTweets.forEach(tweet => {
      const isSentToTelegram = trackedTweetsMap[tweet.id] !== undefined;
      const telegramTopic = trackedTweetsMap[tweet.id] || 'N/A';
      
      console.log(`- Tweet ID: ${tweet.id}`);
      console.log(`  From: @${tweet.tweetBy?.userName}`);
      console.log(`  Text: ${tweet.text?.substring(0, 50)}${tweet.text?.length > 50 ? '...' : ''}`);
      console.log(`  MongoDB Topic ID: ${tweet.metadata.topicId}`);
      console.log(`  Captured: ${new Date(tweet.metadata.capturedAt).toLocaleString()}`);
      console.log(`  Sent to Telegram: ${isSentToTelegram ? 'Yes' : 'No'}`);
      if (isSentToTelegram) {
        console.log(`  Telegram Topic ID: ${telegramTopic}`);
      }
      console.log('');
    });
    
  } catch (error) {
    console.error('Error checking KOL tweets Telegram status:', error);
    throw error;
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

async function main() {
  try {
    await checkKolTelegramStatus();
  } catch (error) {
    console.error('Failed to check KOL tweets Telegram status:', error);
    process.exit(1);
  }
}

main().catch(console.error);