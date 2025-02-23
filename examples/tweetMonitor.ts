import { Rettiwt, TweetFilter } from 'rettiwt-api';
import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class TweetMonitor {
  private client: Rettiwt;
  private searchBuilder: RettiwtSearchBuilder;
  private lastProcessedId: string | null = null;
  private logger: ConsoleLogger;
  private metrics: MetricsManager;
  private errorHandler: ErrorHandler;

  constructor() {
    this.logger = new ConsoleLogger();
    this.metrics = new MetricsManager(this.logger);
    this.errorHandler = new ErrorHandler(this.logger, this.metrics);
    this.client = new Rettiwt({ 
      apiKey: process.env.RETTIWT_API_KEY 
    });
    this.searchBuilder = new RettiwtSearchBuilder(this.logger, this.metrics, this.errorHandler);
  }

  async monitorKeywords(keywords: string[], interval: number = 60000): Promise<void> {
    console.log(`Starting to monitor keywords: ${keywords.join(', ')}`);
    console.log(`Checking every ${interval/1000} seconds...`);

    while (true) {
      try {
        const now = new Date();
        const filter = this.searchBuilder.buildFilter({
          type: 'structured' as const,
          keywords,
          language: 'en',
          startTime: this.lastProcessedId ? undefined : now.toISOString()
        });

        const results = await this.searchWithRetry(filter);
        
        if (results.length > 0) {
          console.log(`\nFound ${results.length} new tweets at ${new Date().toLocaleString()}:`);
          for (const tweet of results) {
            await this.processTweet(tweet);
            this.lastProcessedId = tweet.id;
          }
        }

        await new Promise(resolve => setTimeout(resolve, interval));
      } catch (error) {
        console.error('Monitoring error:', error);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }

  private async processTweet(tweet: any): Promise<void> {
    const timestamp = new Date(tweet.createdAt);
    const formattedDate = timestamp.toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    // Display tweet header with user info
    console.log(`\n[${formattedDate}] @${tweet.tweetBy.userName} (${tweet.tweetBy.fullName})`);
    console.log(`Followers: ${tweet.tweetBy.followersCount.toLocaleString()} | Following: ${tweet.tweetBy.followingsCount.toLocaleString()}`);
    
    // Display tweet content
    console.log('\nContent:', tweet.fullText);
    
    // Display engagement metrics
    console.log('\nEngagement:');
    console.log(`🔁 ${tweet.retweetCount.toLocaleString()} Retweets`);
    console.log(`💬 ${tweet.replyCount.toLocaleString()} Replies`);
    console.log(`❤️ ${tweet.likeCount.toLocaleString()} Likes`);
    console.log(`👁️ ${tweet.viewCount.toLocaleString()} Views`);
    
    // Display quote information if it's a quote tweet
    if (tweet.quotedTweet) {
      console.log('\nQuoted Tweet:');
      console.log(`@${tweet.quotedTweet.tweetBy.userName}: ${tweet.quotedTweet.fullText}`);
    }
    
    // Display media information
    if (tweet.media?.length) {
      console.log('\nMedia:');
      tweet.media.forEach((m: any, index: number) => {
        console.log(`${index + 1}. Type: ${m.type}, URL: ${m.url}`);
      });
    }
    
    // Display hashtags if any
    if (tweet.hashtags?.length) {
      console.log('\nHashtags:', tweet.hashtags.join(', '));
    }
    
    // Display URLs if any
    if (tweet.urls?.length) {
      console.log('\nURLs:', tweet.urls.join(', '));
    }
    
    console.log('\n' + '='.repeat(80)); // Separator between tweets
  }

  private async searchWithRetry(filter: TweetFilter, maxRetries = 3): Promise<any[]> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.client.tweet.search(filter);
        return result.list;
      } catch (error) {
        if (attempt === maxRetries) throw error;
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`Retry attempt ${attempt} failed, waiting ${delay}ms before next attempt`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('All retry attempts failed');
  }
}

// Usage example
const monitor = new TweetMonitor();
monitor.monitorKeywords(['trojan'])
  .catch(error => console.error('Fatal error:', error));