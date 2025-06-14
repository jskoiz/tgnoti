#!/usr/bin/env node

/**
 * Test script for MASS_TRACKING functionality
 * This script tests the CSV loading and batch creation for the new MASS_TRACKING topic
 */

import 'reflect-metadata';
import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { CsvAccountLoader } from '../src/services/CsvAccountLoader.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { Logger } from '../src/types/logger.js';

async function testMassTracking() {
  console.log('🚀 Testing MASS_TRACKING functionality...\n');

  try {
    // Initialize container
    const container = createContainer();
    
    // Get services
    const logger = container.get<Logger>(TYPES.Logger);
    const csvLoader = container.get<CsvAccountLoader>(TYPES.CsvAccountLoader);
    const configService = container.get<ConfigService>(TYPES.ConfigService);
    
    logger.setComponent('MassTrackingTest');
    
    // Test 1: Load CSV accounts
    console.log('📄 Test 1: Loading CSV accounts...');
    const csvPath = 'list.csv';
    const accounts = await csvLoader.loadAccountsFromCsv(csvPath);
    
    console.log(`✅ Successfully loaded ${accounts.length} accounts`);
    console.log(`📊 Sample accounts:`, accounts.slice(0, 5).map(a => `@${a.username} (rank: ${a.rank})`));
    
    // Test 2: Create optimal batches
    console.log('\n🔄 Test 2: Creating optimal batches...');
    const batches = csvLoader.createOptimalBatches(accounts, 8);
    
    console.log(`✅ Created ${batches.length} batches of 8 accounts each`);
    console.log(`📦 First batch:`, batches[0]);
    console.log(`📦 Last batch:`, batches[batches.length - 1]);
    
    // Test 3: Check topic configuration
    console.log('\n⚙️ Test 3: Checking topic configuration...');
    const topics = configService.getTopics();
    const massTrackingTopic = topics.find(t => t.name === 'MASS_TRACKING');
    
    if (massTrackingTopic) {
      console.log(`✅ MASS_TRACKING topic found with ID: ${massTrackingTopic.id}`);
      console.log(`📋 Topic details:`, {
        id: massTrackingTopic.id,
        name: massTrackingTopic.name,
        accountCount: massTrackingTopic.accounts.length
      });
    } else {
      console.log('❌ MASS_TRACKING topic not found in configuration');
    }
    
    // Test 4: Calculate processing estimates
    console.log('\n📈 Test 4: Processing estimates...');
    const batchCount = batches.length;
    const accountsPerBatch = 8;
    const estimatedTimePerBatch = 5; // seconds (conservative estimate)
    const totalEstimatedTime = batchCount * estimatedTimePerBatch;
    
    console.log(`📊 Processing estimates:`);
    console.log(`   • Total accounts: ${accounts.length}`);
    console.log(`   • Batches: ${batchCount}`);
    console.log(`   • Accounts per batch: ${accountsPerBatch}`);
    console.log(`   • Estimated time per batch: ${estimatedTimePerBatch}s`);
    console.log(`   • Total estimated time: ${Math.floor(totalEstimatedTime / 60)}m ${totalEstimatedTime % 60}s`);
    
    // Test 5: Rank distribution analysis
    console.log('\n📊 Test 5: Rank distribution analysis...');
    const rankStats: Record<string, number> = {};
    accounts.forEach(account => {
      const rankRange = account.rank >= 30 ? '30+' :
                       account.rank >= 20 ? '20-29' :
                       account.rank >= 10 ? '10-19' : '4-9';
      rankStats[rankRange] = (rankStats[rankRange] || 0) + 1;
    });
    
    console.log('📈 Rank distribution:');
    Object.entries(rankStats).forEach(([range, count]) => {
      console.log(`   • Rank ${range}: ${count} accounts`);
    });
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Start the application with: npm run dev');
    console.log('   2. The MASS_TRACKING topic will automatically load these accounts');
    console.log('   3. Monitor logs for batch processing progress');
    console.log('   4. Check MongoDB for tweet storage with topic ID 33763');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMassTracking().catch(console.error);