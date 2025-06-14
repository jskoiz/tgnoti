#!/usr/bin/env node

import 'dotenv/config';
import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { DiscordWebhookService } from '../src/services/DiscordWebhookService.js';
import { DeliveryManager } from '../src/services/DeliveryManager.js';
import { ITelegramMessageQueue } from '../src/types/telegram.js';

interface QueueStats {
  timestamp: string;
  discord: {
    queueLength: number;
    metrics: {
      queued: number;
      sent: number;
      errors: number;
      dropped: number;
    };
  };
  telegram: {
    queueLength: number;
  };
  delivery: {
    totalQueued: number;
    metrics: {
      queued: number;
      sent: number;
      errors: number;
      dropped: number;
    };
  };
}

class QueueMonitor {
  private container: any;
  private discordService!: DiscordWebhookService;
  private deliveryManager!: DeliveryManager;
  private telegramQueue!: ITelegramMessageQueue;
  private isRunning = false;
  private stats: QueueStats[] = [];
  private maxStatsHistory = 60; // Keep last 60 readings

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Queue Monitor...');
    
    try {
      this.container = createContainer();
      this.discordService = this.container.get(TYPES.DiscordWebhookService);
      this.deliveryManager = this.container.get(TYPES.DeliveryManager);
      this.telegramQueue = this.container.get(TYPES.TelegramMessageQueue);
      
      console.log('✅ Queue Monitor initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Queue Monitor:', error);
      throw error;
    }
  }

  private collectStats(): QueueStats {
    const timestamp = new Date().toISOString();
    
    const discordMetrics = this.discordService.getMetrics();
    const deliveryMetrics = this.deliveryManager.getMetrics();
    
    // Note: TelegramMessageQueue doesn't expose queue length in current interface
    // This would need to be added to the interface
    const telegramQueueLength = 0; // Placeholder
    
    return {
      timestamp,
      discord: {
        queueLength: this.discordService.getQueueLength(),
        metrics: discordMetrics
      },
      telegram: {
        queueLength: telegramQueueLength
      },
      delivery: {
        totalQueued: this.deliveryManager.getQueueLength(),
        metrics: deliveryMetrics
      }
    };
  }

  private displayStats(stats: QueueStats): void {
    // Clear screen
    console.clear();
    
    // Header
    console.log('📊 MASS_TRACKING Queue Monitor - Real-time Dashboard');
    console.log('=' .repeat(80));
    console.log(`⏰ Last Updated: ${new Date(stats.timestamp).toLocaleTimeString()}`);
    console.log('');

    // Discord Stats
    console.log('🔷 DISCORD WEBHOOK (Primary for MASS_TRACKING)');
    console.log(`   Queue Length: ${stats.discord.queueLength} messages`);
    console.log(`   Total Queued: ${stats.discord.metrics.queued}`);
    console.log(`   Successfully Sent: ${stats.discord.metrics.sent}`);
    console.log(`   Errors: ${stats.discord.metrics.errors}`);
    console.log(`   Dropped: ${stats.discord.metrics.dropped}`);
    
    if (stats.discord.metrics.sent > 0) {
      const successRate = ((stats.discord.metrics.sent / (stats.discord.metrics.sent + stats.discord.metrics.errors)) * 100).toFixed(1);
      console.log(`   Success Rate: ${successRate}%`);
    }
    console.log('');

    // Telegram Stats
    console.log('📱 TELEGRAM QUEUE (Fallback & Other Topics)');
    console.log(`   Queue Length: ${stats.telegram.queueLength} messages`);
    console.log('');

    // Delivery Manager Stats
    console.log('🚀 DELIVERY MANAGER (Combined)');
    console.log(`   Total Queue Length: ${stats.delivery.totalQueued} messages`);
    console.log(`   Total Queued: ${stats.delivery.metrics.queued}`);
    console.log(`   Successfully Sent: ${stats.delivery.metrics.sent}`);
    console.log(`   Errors: ${stats.delivery.metrics.errors}`);
    console.log(`   Dropped: ${stats.delivery.metrics.dropped}`);
    console.log('');

    // Rate Analysis
    if (this.stats.length >= 2) {
      const current = this.stats[this.stats.length - 1];
      const previous = this.stats[this.stats.length - 2];
      
      const timeDiff = (new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000;
      const sentDiff = current.discord.metrics.sent - previous.discord.metrics.sent;
      const messagesPerSecond = timeDiff > 0 ? (sentDiff / timeDiff).toFixed(2) : '0.00';
      
      console.log('📈 PERFORMANCE METRICS');
      console.log(`   Messages/Second: ${messagesPerSecond}`);
      console.log(`   Messages/Minute: ${(parseFloat(messagesPerSecond) * 60).toFixed(1)}`);
    }

    // Trend Analysis (last 10 readings)
    if (this.stats.length >= 10) {
      const recent = this.stats.slice(-10);
      const avgQueueLength = (recent.reduce((sum, stat) => sum + stat.discord.queueLength, 0) / recent.length).toFixed(1);
      const maxQueueLength = Math.max(...recent.map(stat => stat.discord.queueLength));
      
      console.log('');
      console.log('📊 TREND ANALYSIS (Last 10 readings)');
      console.log(`   Average Queue Length: ${avgQueueLength}`);
      console.log(`   Peak Queue Length: ${maxQueueLength}`);
      
      // Queue health indicator
      const currentQueueLength = stats.discord.queueLength;
      let healthStatus = '🟢 HEALTHY';
      if (currentQueueLength > 50) healthStatus = '🟡 MODERATE';
      if (currentQueueLength > 100) healthStatus = '🔴 HIGH LOAD';
      if (currentQueueLength > 200) healthStatus = '🚨 CRITICAL';
      
      console.log(`   Queue Health: ${healthStatus}`);
    }

    // Warnings
    console.log('');
    console.log('⚠️  ALERTS');
    
    if (stats.discord.queueLength > 100) {
      console.log('   🚨 Discord queue length is high (>100 messages)');
    }
    
    if (stats.discord.metrics.errors > stats.discord.metrics.sent * 0.1) {
      console.log('   ⚠️  High error rate detected (>10%)');
    }
    
    if (stats.discord.queueLength === 0 && stats.delivery.totalQueued === 0) {
      console.log('   ✅ All queues are empty - system is caught up');
    }

    // Instructions
    console.log('');
    console.log('🔧 CONTROLS');
    console.log('   Press Ctrl+C to exit');
    console.log('   Refreshes every 2 seconds');
  }

  private displayTopicConfiguration(): void {
    console.log('');
    console.log('📋 TOPIC DELIVERY CONFIGURATION');
    console.log('-'.repeat(50));
    
    const configs = this.deliveryManager.getAllTopicConfigs();
    configs.forEach((config, topicId) => {
      console.log(`Topic ${topicId}:`);
      Object.entries(config.deliveryMethods).forEach(([method, methodConfig]) => {
        const status = methodConfig.enabled ? '✅' : '❌';
        console.log(`  ${status} ${method.toUpperCase()} (Priority: ${methodConfig.priority})`);
      });
      console.log('');
    });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    
    // Display initial configuration
    this.displayTopicConfiguration();
    
    console.log('Starting real-time monitoring...');
    console.log('Press Ctrl+C to stop');
    
    // Set up graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down Queue Monitor...');
      this.stop();
      process.exit(0);
    });

    // Main monitoring loop
    while (this.isRunning) {
      try {
        const stats = this.collectStats();
        this.stats.push(stats);
        
        // Keep only recent stats
        if (this.stats.length > this.maxStatsHistory) {
          this.stats = this.stats.slice(-this.maxStatsHistory);
        }
        
        this.displayStats(stats);
        
        // Wait 2 seconds before next update
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Error collecting stats:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer on error
      }
    }
  }

  stop(): void {
    this.isRunning = false;
  }
}

// Main execution
async function main() {
  const monitor = new QueueMonitor();
  
  try {
    await monitor.initialize();
    await monitor.start();
  } catch (error) {
    console.error('Queue Monitor failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { QueueMonitor };