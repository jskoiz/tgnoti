#!/usr/bin/env node

import TelegramBot from 'node-telegram-bot-api';
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

async function testTelegramTopic() {
  console.log('Testing Telegram topic...');
  
  // Get Telegram configuration
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const groupId = process.env.TELEGRAM_GROUP_ID;
  
  if (!botToken) {
    console.error('TELEGRAM_BOT_TOKEN environment variable not set');
    return;
  }
  
  if (!groupId) {
    console.error('TELEGRAM_GROUP_ID environment variable not set');
    return;
  }
  
  // Get topic ID from command line argument or use default
  const topicId = process.argv[2] || '6531';
  
  console.log(`Using Telegram bot token: ${botToken.substring(0, 10)}...`);
  console.log(`Using group ID: ${groupId}`);
  console.log(`Using topic ID: ${topicId}`);
  
  // Create Telegram bot
  const bot = new TelegramBot(botToken, { polling: false });
  
  try {
    // Send test message
    const message = `Test message to topic ${topicId} - ${new Date().toLocaleString()}`;
    console.log(`Sending message: "${message}"`);
    
    const result = await bot.sendMessage(groupId, message, {
      message_thread_id: parseInt(topicId),
      parse_mode: 'HTML'
    });
    
    console.log('Message sent successfully!');
    console.log('Message ID:', result.message_id);
    console.log('Chat ID:', result.chat.id);
    console.log('Thread ID:', result.message_thread_id);
    
  } catch (error) {
    console.error('Error sending message to Telegram:', error);
    
    // Check for specific error types
    if (error.code === 'ETELEGRAM') {
      console.error('Telegram API error:', error.response?.body);
      
      // Check for common errors
      if (error.response?.body?.description?.includes('chat not found')) {
        console.error('Error: Chat not found. Make sure the bot is added to the group.');
      } else if (error.response?.body?.description?.includes('topic not found')) {
        console.error('Error: Topic not found. Make sure the topic exists in the group.');
      } else if (error.response?.body?.description?.includes('bot is not a member')) {
        console.error('Error: Bot is not a member of the group. Add the bot to the group.');
      }
    }
  }
}

async function main() {
  try {
    await testTelegramTopic();
  } catch (error) {
    console.error('Failed to test Telegram topic:', error);
    process.exit(1);
  }
}

main().catch(console.error);