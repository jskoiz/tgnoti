import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import { Rettiwt } from 'rettiwt-api';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function searchForTrojan() {
  // Initialize dependencies
  const logger = new ConsoleLogger();
  const metrics = new MetricsManager(logger);
  const errorHandler = new ErrorHandler(logger, metrics);
  const searchBuilder = new RettiwtSearchBuilder(logger, metrics, errorHandler);
  
  // Create the Rettiwt client with your API key
  const client = new Rettiwt({ 
    apiKey: process.env.RETTIWT_API_KEY 
  });

  try {
    // Create a filter to search for "trojan" (case-insensitive)
    const filter = searchBuilder.buildSimpleWordSearch('trojan');
    
    console.log('Searching with filter:', JSON.stringify(filter, null, 2));
    
    // Perform the search
    const result = await client.tweet.search(filter);
    
    // Log results
    console.log('\nFound tweets:');
    for (const tweet of result.list) {
      // Format the date in a readable way
      const tweetDate = new Date(tweet.createdAt);
      const formattedDate = tweetDate.toLocaleString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      console.log(`\n[${formattedDate}] @${tweet.tweetBy.userName}:`);
      console.log(tweet.fullText);
    }
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Run the search
searchForTrojan();