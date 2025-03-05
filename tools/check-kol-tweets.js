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

async function checkKolTweets() {
  console.log('Checking MongoDB for KOL tweets (topic 6531)...');
  
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
    
    // Count total tweets
    const totalCount = await tweetsCollection.countDocuments({});
    console.log(`Total tweets in database: ${totalCount}`);
    
    // Count KOL tweets
    const kolCount = await tweetsCollection.countDocuments({
      'metadata.topicId': '6531'
    });
    console.log(`KOL tweets (topic 6531) in database: ${kolCount}`);
    
    // Get the most recent KOL tweets
    const recentKolTweets = await tweetsCollection
      .find({ 'metadata.topicId': '6531' })
      .sort({ 'metadata.capturedAt': -1 })
      .limit(5)
      .toArray();
    
    if (recentKolTweets.length > 0) {
      console.log('\nMost recent KOL tweets:');
      recentKolTweets.forEach(tweet => {
        console.log(`- Tweet ID: ${tweet.id}`);
        console.log(`  From: @${tweet.tweetBy?.userName}`);
        console.log(`  Text: ${tweet.text?.substring(0, 50)}${tweet.text?.length > 50 ? '...' : ''}`);
        console.log(`  Captured: ${new Date(tweet.metadata.capturedAt).toLocaleString()}`);
        console.log(`  Processed: ${tweet.processingStatus.isAnalyzed ? 'Yes' : 'No'}`);
        console.log('');
      });
    } else {
      console.log('\nNo KOL tweets found in the database.');
    }
    
    // Check if there are any tweets from KOL accounts in other topics
    const kolAccounts = [
      'macdegods', 'Stefan_Sav', '0xvisitor', 'mikadontlouz', 'uhnick1',
      'jussy_world', 'Lin_DAO_', 'SerConnorr', 'moh1shh', 'roxinft'
      // This is just a sample of the KOL accounts
    ];
    
    const kolTweetsInOtherTopics = await tweetsCollection
      .find({
        'tweetBy.userName': { $in: kolAccounts },
        'metadata.topicId': { $ne: '6531' }
      })
      .sort({ 'metadata.capturedAt': -1 })
      .limit(5)
      .toArray();
    
    if (kolTweetsInOtherTopics.length > 0) {
      console.log('\nKOL tweets found in other topics:');
      kolTweetsInOtherTopics.forEach(tweet => {
        console.log(`- Tweet ID: ${tweet.id}`);
        console.log(`  From: @${tweet.tweetBy?.userName}`);
        console.log(`  Topic: ${tweet.metadata.topicId}`);
        console.log(`  Text: ${tweet.text?.substring(0, 50)}${tweet.text?.length > 50 ? '...' : ''}`);
        console.log(`  Captured: ${new Date(tweet.metadata.capturedAt).toLocaleString()}`);
        console.log('');
      });
    } else {
      console.log('\nNo KOL tweets found in other topics.');
    }
    
  } catch (error) {
    console.error('Error checking MongoDB for KOL tweets:', error);
    throw error;
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

async function main() {
  try {
    await checkKolTweets();
  } catch (error) {
    console.error('Failed to check KOL tweets:', error);
    process.exit(1);
  }
}

main().catch(console.error);