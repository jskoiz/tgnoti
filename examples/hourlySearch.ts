import { Rettiwt } from 'rettiwt-api';
import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function searchLastHour() {
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
    // Create a date-filtered search for the last hour
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));

    const config = {
      type: 'structured' as const,
      keywords: ['trojan'],
      language: 'en',
      startTime: oneHourAgo.toISOString(),
      endTime: now.toISOString()
    };
    
    const filter = searchBuilder.buildFilter(config);
    console.log('Searching with filter:', JSON.stringify(filter, null, 2));
    
    // Perform the search
    const result = await client.tweet.search(filter);
    
    // Log results
    console.log(`\nFound ${result.list.length} tweets from the last hour:\n`);
    for (const tweet of result.list) {
      // Format the date
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
      
      // Display tweet header with user info
      console.log(`[${formattedDate}] @${tweet.tweetBy.userName} (${tweet.tweetBy.fullName})`);
      console.log(`Followers: ${tweet.tweetBy.followersCount.toLocaleString()} | Following: ${tweet.tweetBy.followingsCount.toLocaleString()}`);
      
      // Display tweet content
      console.log('\nContent:', tweet.fullText);
      
      // Display engagement metrics
      console.log('\nEngagement:');
      console.log(`🔁 ${tweet.retweetCount.toLocaleString()} Retweets`);
      console.log(`💬 ${tweet.replyCount.toLocaleString()} Replies`);
      console.log(`❤️ ${tweet.likeCount.toLocaleString()} Likes`);
      console.log(`👁️ ${tweet.viewCount.toLocaleString()} Views`);
      console.log(`🔖 ${tweet.bookmarkCount.toLocaleString()} Bookmarks`);
      
      // Display media information
      if (tweet.media?.length) {
        console.log('\nMedia:');
        tweet.media.forEach((m: any, index: number) => {
          console.log(`${index + 1}. Type: ${m.type}, URL: ${m.url}`);
        });
      }
      
      // Display mentioned users if any
      if (tweet.entities?.mentionedUsers?.length) {
        console.log('\nMentions:', tweet.entities.mentionedUsers.map(u => '@' + u).join(', '));
      }
      
      // Display hashtags if any
      if (tweet.entities?.hashtags?.length) {
        console.log('\nHashtags:', tweet.entities.hashtags.join(', '));
      }
      
      console.log('\n' + '='.repeat(80) + '\n'); // Separator between tweets
    }
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Run the search
searchLastHour();