// Simple script to test the logging changes
const { ConsoleTransport } = require('./dist/logging/transports/LogTransport.js');

// Create a console transport instance
const transport = new ConsoleTransport({ useColors: true });

// Test with various log messages
const testMessages = [
  // Topic headers
  { level: 2, component: 'Main', message: 'Topic COMPETITOR_TWEETS processed: 20 tweets found, 0 processed in 7990ms', timestamp: new Date() },
  { level: 2, component: 'Main', message: 'Topic COMPETITOR_MENTIONS processed: 14 tweets found, 0 processed in 10153ms', timestamp: new Date() },
  { level: 2, component: 'Main', message: 'Topic TROJAN processed: 11 tweets found, 0 processed in 10644ms', timestamp: new Date() },
  { level: 2, component: 'Main', message: 'Topic KOL_MONITORING processed: 20 tweets found, 0 processed in 12364ms', timestamp: new Date() },
  
  // Search messages
  { level: 2, component: 'Main', message: '[SRCH] Topic COMPETITOR_TWEETS search window: 2025-03-10T00:49:23.789Z to 2025-03-10T00:51:11.997Z', timestamp: new Date() },
  { level: 2, component: 'Main', message: '[SRCH] Topic COMPETITOR_MENTIONS search window: 2025-03-10T00:49:31.718Z to 2025-03-10T00:51:19.987Z', timestamp: new Date() },
  
  // Batch search messages
  { level: 2, component: 'Main', message: '[BATCH SEARCH] Looking for tweets AUTHORED BY 7 accounts since 2025-03-10T00:49:23.789Z', timestamp: new Date() },
  { level: 2, component: 'Main', message: '[BATCH SEARCH RESULT] Found 20 tweets from 7 accounts in 5316ms', timestamp: new Date() },
  
  // Redundant messages
  { level: 2, component: 'Main', message: 'Found 20 tweets for batch of 7 accounts', timestamp: new Date() },
  { level: 2, component: 'Main', message: '[SEARCH] Searching for tweets AUTHORED BY: tradewithPhoton, bullx_io, tradeonnova, maestrobots, bonkbot_io, gmgnai, bloomtradingbot', timestamp: new Date() },
  { level: 2, component: 'Main', message: '[SEARCH] [BATCH] Found 20 tweets from 7 accounts', timestamp: new Date() },
  { level: 2, component: 'Main', message: 'Searching tweets for 7 accounts in batch: tradewithPhoton, bullx_io, tradeonnova, maestrobots, bonkbot_io, gmgnai, bloomtradingbot', timestamp: new Date() },
  
  // Cycle complete message
  { level: 2, component: 'Main', message: '[CYCLE COMPLETE] Search cycle finished: 65 tweets found, 0 processed in 41556ms', timestamp: new Date() }
];

// Log each test message
console.log('Testing log formatting:');
console.log('======================');
testMessages.forEach(msg => {
  transport.log(msg);
});