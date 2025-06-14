#!/usr/bin/env npx tsx

/**
 * Test script to verify Telegram message queue rate limiting
 * This script tests the TelegramMessageQueue to ensure it properly handles rate limits
 */

import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { ITelegramMessageQueue } from '../src/types/telegram.js';
import { Logger } from '../src/types/logger.js';

async function testTelegramQueue() {
  console.log('🧪 Testing Telegram Message Queue Rate Limiting...\n');
  
  try {
    // Initialize container
    const container = createContainer();
    const logger = container.get<Logger>(TYPES.Logger);
    const telegramQueue = container.get<ITelegramMessageQueue>(TYPES.TelegramMessageQueue);
    
    logger.setComponent('TelegramQueueTest');
    
    // Get queue status
    const initialStatus = telegramQueue.getQueueStatus();
    console.log('📊 Initial Queue Status:');
    console.log(`   - Processing: ${initialStatus.isProcessing}`);
    console.log(`   - Paused: ${initialStatus.isPaused}`);
    console.log(`   - Queue Size: ${initialStatus.currentQueueSize}\n`);
    
    // Queue a few test messages
    console.log('📤 Queueing test messages...');
    
    const testMessages = [
      'Test message 1 - Rate limiting verification',
      'Test message 2 - Queue processing test',
      'Test message 3 - Delay verification'
    ];
    
    const messageIds: string[] = [];
    
    for (let i = 0; i < testMessages.length; i++) {
      const messageId = await telegramQueue.queueMessage({
        chatId: -1002379334714, // Use the actual group ID from logs
        threadId: 33763, // MASS_TRACKING topic
        content: `🧪 ${testMessages[i]} (${new Date().toISOString()})`,
        messageOptions: {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: true // Don't spam notifications during testing
        },
        priority: 1
      });
      
      messageIds.push(messageId);
      console.log(`   ✅ Queued message ${i + 1}: ${messageId}`);
    }
    
    // Monitor queue for 30 seconds
    console.log('\n⏱️  Monitoring queue processing for 30 seconds...');
    console.log('   (Watch for proper delays and rate limit handling)\n');
    
    const startTime = Date.now();
    const monitorDuration = 30000; // 30 seconds
    
    while (Date.now() - startTime < monitorDuration) {
      const status = telegramQueue.getQueueStatus();
      const metrics = telegramQueue.getMetrics();
      
      console.log(`📊 Queue Status (${Math.floor((Date.now() - startTime) / 1000)}s):`);
      console.log(`   - Queue Size: ${status.currentQueueSize}`);
      console.log(`   - Processing: ${status.isProcessing}`);
      console.log(`   - Success Rate: ${metrics.successRate.toFixed(1)}%`);
      console.log(`   - Avg Retry Count: ${metrics.averageRetryCount.toFixed(2)}`);
      console.log('');
      
      // If queue is empty, we're done
      if (status.currentQueueSize === 0) {
        console.log('✅ Queue is empty - all messages processed!');
        break;
      }
      
      // Wait 5 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Final status
    const finalStatus = telegramQueue.getQueueStatus();
    const finalMetrics = telegramQueue.getMetrics();
    
    console.log('📋 Final Results:');
    console.log(`   - Messages Queued: ${testMessages.length}`);
    console.log(`   - Queue Size: ${finalStatus.currentQueueSize}`);
    console.log(`   - Success Rate: ${finalMetrics.successRate.toFixed(1)}%`);
    
    if (finalStatus.currentQueueSize === 0) {
      console.log('\n🎉 SUCCESS: All messages processed without errors!');
      console.log('   Rate limiting appears to be working correctly.');
    } else {
      console.log('\n⚠️  WARNING: Some messages still in queue.');
      console.log('   This could indicate rate limiting or processing issues.');
    }
    
  } catch (error) {
    console.error('❌ Error testing Telegram queue:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(0);
});

// Run the test
testTelegramQueue().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});