#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';
import { MongoClient } from 'mongodb';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const basePath = dirname(__dirname);

// Load environment variables
const envPath = `${basePath}/.env`;
console.log('Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

async function checkMongoDBTopicFilters() {
  console.log('Checking MongoDB topic filters...');
  
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI environment variable not set');
    return [];
  }
  
  const client = new MongoClient(mongoUri);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const topicFiltersCollection = db.collection('topicFilters');
    
    // Query for topic filters with topicId 6531
    const filters = await topicFiltersCollection.find({ topicId: 6531 }).toArray();
    
    return filters;
    
  } catch (error) {
    console.error('Error querying MongoDB topic filters:', error);
    throw error;
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

async function checkKolMonitoring() {
  console.log('Checking KOL Monitoring configuration...');
  
  // Check config.json
  try {
    const configPath = path.join(basePath, 'config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    console.log('\nConfig.json KOL Monitoring Configuration:');
    
    // Check telegram configuration
    if (config.telegram && config.telegram.topicIds) {
      const kolTopic = Object.entries(config.telegram.topicIds)
        .find(([name, id]) => name === 'KOL_MONITORING' || id === 6531);
      
      if (kolTopic) {
        console.log(`KOL_MONITORING topic: ✅ Found (ID: ${kolTopic[1]})`);
      } else {
        console.log('KOL_MONITORING topic: ❌ Not found');
      }
    } else {
      console.log('telegram.topicIds: ❌ Not present');
    }
    
    // Check twitter searchQueries
    if (config.twitter && config.twitter.searchQueries) {
      const kolQuery = config.twitter.searchQueries['6531'];
      
      if (kolQuery) {
        console.log(`KOL search query: ✅ Found (${JSON.stringify(kolQuery)})`);
      } else {
        console.log('KOL search query: ❌ Not found');
      }
    } else {
      console.log('twitter.searchQueries: ❌ Not present');
    }
  } catch (error) {
    console.error('Error reading config.json:', error);
  }
  
  // Check MongoDB topic filters
  try {
    const topicFilters = await checkMongoDBTopicFilters();
    console.log(`\nMongoDB topic filters for KOL_MONITORING (6531): ${topicFilters.length}`);
    
    if (topicFilters.length > 0) {
      console.log('Filter types:');
      const filterTypes = {};
      topicFilters.forEach(filter => {
        filterTypes[filter.filter_type] = (filterTypes[filter.filter_type] || 0) + 1;
      });
      
      Object.entries(filterTypes).forEach(([type, count]) => {
        console.log(`- ${type}: ${count}`);
      });
      
      // Show a sample of filters
      console.log('\nSample filters:');
      topicFilters.slice(0, 5).forEach(filter => {
        console.log(`- ${filter.filterType}: ${filter.value}`);
      });
    }
  } catch (error) {
    console.error('Error checking MongoDB topic filters:', error);
  }
  
  // Check src/config files
  try {
    const topicConfigPath = path.join(basePath, 'src', 'config', 'topicConfig.ts');
    const topicConfigContent = await fs.readFile(topicConfigPath, 'utf-8');
    
    console.log('\nTopicConfig.ts KOL_MONITORING check:');
    if (topicConfigContent.includes('KOL_MONITORING')) {
      console.log('KOL_MONITORING in topicConfig.ts: ✅ Found');
    } else {
      console.log('KOL_MONITORING in topicConfig.ts: ❌ Not found');
    }
    
    const monitoringPath = path.join(basePath, 'src', 'config', 'monitoring.ts');
    const monitoringContent = await fs.readFile(monitoringPath, 'utf-8');
    
    console.log('\nMonitoring.ts KOL_MONITORING check:');
    if (monitoringContent.includes('topicId: 6531')) {
      console.log('KOL accounts with topicId 6531 in monitoring.ts: ✅ Found');
      
      // Count KOL accounts
      const matches = monitoringContent.match(/topicId: 6531/g);
      if (matches) {
        console.log(`Number of KOL accounts: ${matches.length}`);
      }
    } else {
      console.log('KOL accounts with topicId 6531 in monitoring.ts: ❌ Not found');
    }
  } catch (error) {
    console.error('Error checking source files:', error);
  }
}

async function main() {
  try {
    await checkKolMonitoring();
  } catch (error) {
    console.error('Failed to check KOL Monitoring configuration:', error);
    process.exit(1);
  }
}

main().catch(console.error);