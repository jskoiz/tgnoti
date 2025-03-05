#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
import fs from 'fs/promises';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const basePath = dirname(__dirname);

// Load environment variables
const envPath = `${basePath}/.env`;
console.log('Loading environment variables from:', envPath);
dotenv.config({ path: envPath });

async function checkTelegramConfig() {
  console.log('Checking Telegram configuration...');
  
  // Check environment variables
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  
  console.log('\nTelegram Environment Variables:');
  console.log(`TELEGRAM_BOT_TOKEN: ${botToken ? '✅ Set' : '❌ Not set'}`);
  console.log(`TELEGRAM_GROUP_ID: ${groupId ? `✅ Set (${groupId})` : '❌ Not set'}`);
  
  // Check config.json
  try {
    const configPath = path.join(basePath, 'config.json');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    console.log('\nConfig.json Telegram Configuration:');
    
    // Check telegram configuration
    if (config.telegram) {
      console.log('telegram: ✅ Present');
      
      // Check topicIds
      if (config.telegram.topicIds) {
        console.log(`topicIds: ✅ Present (${Object.keys(config.telegram.topicIds).length} topics)`);
        
        // Check for KOL_MONITORING topic
        const kolTopic = Object.entries(config.telegram.topicIds)
          .find(([name, id]) => name === 'KOL_MONITORING' || id === 6531);
        
        if (kolTopic) {
          console.log(`KOL_MONITORING topic: ✅ Found (ID: ${kolTopic[1]})`);
        } else {
          console.log('KOL_MONITORING topic: ❌ Not found');
        }
      } else {
        console.log('topicIds: ❌ Not present');
      }
      
      // Check topics
      if (config.telegram.topics) {
        console.log(`topics: ✅ Present (${Object.keys(config.telegram.topics).length} topics)`);
        
        // Check for topic 6531
        if (config.telegram.topics['6531']) {
          console.log(`Topic 6531: ✅ Found (${JSON.stringify(config.telegram.topics['6531'])})`);
        } else {
          console.log('Topic 6531: ❌ Not found');
        }
      } else {
        console.log('topics: ❌ Not present');
      }
    } else {
      console.log('telegram: ❌ Not present');
    }
  } catch (error) {
    console.error('Error reading config.json:', error);
  }
}

async function main() {
  try {
    await checkTelegramConfig();
  } catch (error) {
    console.error('Failed to check Telegram configuration:', error);
    process.exit(1);
  }
}

main().catch(console.error);