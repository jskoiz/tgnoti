#!/usr/bin/env node

import 'dotenv/config';
import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { DiscordWebhookService } from '../src/services/DiscordWebhookService.js';
import { DeliveryManager } from '../src/services/DeliveryManager.js';
import { Tweet } from '../src/types/twitter.js';
import { TopicConfig } from '../src/config/unified.js';

async function testDiscordWebhook() {
  console.log('🧪 Testing Discord Webhook Integration for MASS_TRACKING');
  console.log('=' .repeat(60));

  try {
    // Initialize container
    console.log('📦 Initializing container...');
    const container = createContainer();
    
    // Get services
    const discordService = container.get<DiscordWebhookService>(TYPES.DiscordWebhookService);
    const deliveryManager = container.get<DeliveryManager>(TYPES.DeliveryManager);
    
    console.log('✅ Services initialized successfully');

    // Create a test tweet
    const testTweet: Tweet = {
      id: '1933000000000000000',
      text: '🚀 This is a test tweet for MASS_TRACKING Discord integration! Testing Phase 1 implementation with enhanced delivery methods. #crypto #trading',
      createdAt: new Date().toISOString(),
      tweetBy: {
        id: '123456789',
        userId: '123456789',
        userName: 'testuser',
        displayName: 'Test User',
        fullName: 'Test User',
        followersCount: 1000,
        followingCount: 500,
        statusesCount: 2000,
        verified: false,
        isVerified: false,
        createdAt: '2020-01-01T00:00:00.000Z'
      },
      replyCount: 5,
      retweetCount: 12,
      likeCount: 45,
      viewCount: 1200,
      entities: {
        hashtags: ['crypto', 'trading'],
        mentionedUsers: [],
        urls: []
      }
    };

    // Create MASS_TRACKING topic config
    const massTrackingTopic: TopicConfig = {
      id: 33763,
      name: 'MASS_TRACKING',
      accounts: ['testuser'],
      searchWindowMinutes: 60
    };

    console.log('');
    console.log('📝 Test Tweet Details:');
    console.log(`   ID: ${testTweet.id}`);
    console.log(`   Author: @${testTweet.tweetBy.userName} (${testTweet.tweetBy.displayName})`);
    console.log(`   Text: ${testTweet.text.substring(0, 100)}...`);
    console.log(`   Engagement: ${testTweet.likeCount} likes, ${testTweet.retweetCount} retweets`);

    console.log('');
    console.log('🚀 Testing DeliveryManager (should route to Discord for MASS_TRACKING)...');
    console.log('   Note: This tests the production flow that TweetProcessor uses');
    
    try {
      await deliveryManager.sendTweetNotification(testTweet, massTrackingTopic);
      console.log('✅ DeliveryManager test successful');
    } catch (error) {
      console.error('❌ DeliveryManager test failed:', error);
    }

    console.log('');
    console.log('🔷 Testing Discord Service directly (internal component test)...');
    
    try {
      // Create a different test tweet to avoid confusion
      const directTestTweet = { ...testTweet, id: '1933000000000000001', text: '🔧 Direct Discord service test - this should be the second message' };
      await discordService.sendTweetNotification(directTestTweet, massTrackingTopic);
      console.log('✅ Discord service test successful');
    } catch (error) {
      console.error('❌ Discord service test failed:', error);
    }

    console.log('');
    console.log('📊 Queue Status:');
    console.log(`   Discord Queue Length: ${discordService.getQueueLength()}`);
    console.log(`   Delivery Manager Queue Length: ${deliveryManager.getQueueLength()}`);

    const discordMetrics = discordService.getMetrics();
    console.log('');
    console.log('📈 Discord Metrics:');
    console.log(`   Queued: ${discordMetrics.queued}`);
    console.log(`   Sent: ${discordMetrics.sent}`);
    console.log(`   Errors: ${discordMetrics.errors}`);
    console.log(`   Dropped: ${discordMetrics.dropped}`);

    console.log('');
    console.log('🔧 Delivery Configuration:');
    const topicConfig = deliveryManager.getTopicDeliveryConfig(33763);
    if (topicConfig) {
      Object.entries(topicConfig.deliveryMethods).forEach(([method, config]) => {
        const status = config.enabled ? '✅ Enabled' : '❌ Disabled';
        console.log(`   ${method.toUpperCase()}: ${status} (Priority: ${config.priority})`);
      });
    }

    console.log('');
    console.log('⏳ Waiting 10 seconds to observe message processing...');
    
    // Wait and show queue status updates
    for (let i = 10; i > 0; i--) {
      process.stdout.write(`\r   ${i} seconds remaining... Discord queue: ${discordService.getQueueLength()} messages`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n');
    console.log('📊 Final Status:');
    console.log(`   Discord Queue Length: ${discordService.getQueueLength()}`);
    
    const finalMetrics = discordService.getMetrics();
    console.log(`   Messages Sent: ${finalMetrics.sent}`);
    console.log(`   Errors: ${finalMetrics.errors}`);

    if (finalMetrics.sent > 0) {
      console.log('');
      console.log('🎉 SUCCESS! Discord webhook integration is working!');
      console.log('   Check your Discord channel for the test message.');
    } else if (discordService.getQueueLength() > 0) {
      console.log('');
      console.log('⏳ Messages are queued but not yet sent.');
      console.log('   This is normal due to rate limiting. Check Discord in a few moments.');
    } else {
      console.log('');
      console.log('⚠️  No messages were queued. Check configuration.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testDiscordWebhook().then(() => {
  console.log('');
  console.log('✅ Discord webhook test completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});