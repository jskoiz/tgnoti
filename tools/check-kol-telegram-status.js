#!/usr/bin/env node

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

async function checkMongoDBTracking(tweetIds, client) {
  console.log('Checking MongoDB for tweet tracking status...');
  
  try {
    const db = client.db('twitter_notifications');
    
    // We'll check for tweets with different topic IDs to see if they've been sent to other topics
    const trackedTweets = await db.collection('tweets')
      .find({
        id: { $in: tweetIds },
        'metadata.topicId': { $ne: '6531' } // Looking for tweets sent to other topics
      })
      .toArray();
    
    // Create a map of tracked tweets for easy lookup
    const trackedTweetsMap = {};
    trackedTweets.forEach(tweet => {
      // If this tweet exists with a different topic ID, it was likely sent to Telegram
      if (!trackedTweetsMap[tweet.id]) {
        trackedTweetsMap[tweet.id] = tweet.metadata.topicId;
      }
    });
    
    return trackedTweetsMap;
  } catch (error) {
    throw error;
  }
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
    
    // Check if these tweets are marked as seen in other MongoDB collections/topics
    const trackedTweetsMap = await checkMongoDBTracking(tweetIds, client);
    
    console.log(`Found ${Object.keys(trackedTweetsMap).length} of these tweets sent to other topics.`);
    // Display status for each tweet
    console.log('\nTweet status:');
    recentKolTweets.forEach(tweet => {
      const isSentToTelegram = tweet.metadata.sentToTelegram || trackedTweetsMap[tweet.id] !== undefined;
      const telegramTopic = trackedTweetsMap[tweet.id] || tweet.metadata.topicId || 'N/A';
      
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