#!/usr/bin/env npx tsx

/**
 * Diagnostic tool to test Twitter API endpoints and identify issues
 */

import { Rettiwt } from 'rettiwt-api';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function diagnoseApiIssues() {
  console.log('🔍 Twitter API Diagnostic Tool');
  console.log('================================');
  
  const apiKey = process.env.RETTIWT_API_KEY;
  if (!apiKey) {
    console.error('❌ RETTIWT_API_KEY not found in environment');
    process.exit(1);
  }
  
  console.log(`✅ API Key found (length: ${apiKey.length})`);
  console.log(`   Prefix: ${apiKey.substring(0, 20)}...`);
  console.log(`   Contains auth_token: ${apiKey.includes('auth_token=')}`);
  console.log(`   Contains twid: ${apiKey.includes('twid=')}`);
  console.log('');
  
  try {
    // Create Rettiwt client
    console.log('🔧 Creating Rettiwt client...');
    const client = new Rettiwt({ 
      apiKey: apiKey,
      timeout: 30000
    });
    console.log('✅ Client created successfully');
    console.log('');
    
    // Test 1: Check client methods
    console.log('🧪 Test 1: Client Method Availability');
    console.log(`   Has tweet: ${!!client.tweet}`);
    console.log(`   Has tweet.search: ${!!client.tweet?.search}`);
    console.log(`   Has user: ${!!client.user}`);
    console.log(`   Has user.details: ${!!client.user?.details}`);
    console.log(`   Has user.timeline: ${!!client.user?.timeline}`);
    console.log('');
    
    // Test 2: Simple user lookup
    console.log('🧪 Test 2: User Details Lookup');
    const testUsers = ['tradewithPhoton', 'bullx_io', 'elonmusk'];
    
    for (const username of testUsers) {
      try {
        console.log(`   Testing user: ${username}`);
        const user = await client.user.details(username);
        if (user) {
          console.log(`   ✅ ${username}: Found (ID: ${user.id}, Followers: ${user.followersCount})`);
        } else {
          console.log(`   ⚠️  ${username}: Not found (null response)`);
        }
      } catch (error) {
        const err = error as any;
        console.log(`   ❌ ${username}: Error - ${err.message}`);
        if (err.response?.status) {
          console.log(`      Status: ${err.response.status}`);
        }
      }
      
      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log('');
    
    // Test 3: Simple search
    console.log('🧪 Test 3: Search API Test');
    try {
      const searchConfig = {
        fromUsers: ['elonmusk'],
        language: 'en',
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
        endTime: new Date().toISOString()
      };
      
      console.log('   Search config:', JSON.stringify(searchConfig, null, 2));
      const searchResult = await client.tweet.search(searchConfig);
      console.log(`   ✅ Search successful: Found ${searchResult?.list?.length || 0} tweets`);
      
      if (searchResult?.list?.length > 0) {
        const firstTweet = searchResult.list[0];
        console.log(`   Sample tweet: ID=${firstTweet.id || 'unknown'}, by @${(firstTweet as any).user?.username || (firstTweet as any).tweetBy?.userName || 'unknown'}`);
      }
    } catch (error) {
      const err = error as any;
      console.log(`   ❌ Search failed: ${err.message}`);
      if (err.response?.status) {
        console.log(`      Status: ${err.response.status}`);
        console.log(`      URL: ${err.config?.url || 'unknown'}`);
      }
      console.log(`      Full error:`, err);
    }
    console.log('');
    
    // Test 4: Timeline fallback
    console.log('🧪 Test 4: Timeline Fallback Test');
    try {
      const user = await client.user.details('elonmusk');
      if (user) {
        console.log(`   User found: ${user.userName} (ID: ${user.id})`);
        
        const timeline = await client.user.timeline(user.id);
        console.log(`   ✅ Timeline successful: Found ${timeline?.list?.length || 0} tweets`);
        
        if (timeline?.list?.length > 0) {
          const firstTweet = timeline.list[0];
          console.log(`   Sample tweet: ID=${firstTweet.id || 'unknown'}, text="${((firstTweet as any).text || (firstTweet as any).fullText || 'no text')?.substring(0, 50)}..."`);
        }
      }
    } catch (error) {
      const err = error as any;
      console.log(`   ❌ Timeline failed: ${err.message}`);
      if (err.response?.status) {
        console.log(`      Status: ${err.response.status}`);
      }
    }
    
  } catch (error) {
    const err = error as any;
    console.error('❌ Fatal error:', err.message);
    console.error('   Stack:', err.stack);
  }
  
  console.log('');
  console.log('🏁 Diagnostic complete');
}

// Run the diagnostic
diagnoseApiIssues().catch(console.error);