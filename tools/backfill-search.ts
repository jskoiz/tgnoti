#!/usr/bin/env node
import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { TwitterService } from '../src/services/TwitterService.js';
import { TweetProcessor } from '../src/services/TweetProcessor.js';
import { EnhancedRateLimiter } from '../src/utils/enhancedRateLimiter.js';
import { EnhancedCircuitBreaker } from '../src/utils/enhancedCircuitBreaker.js';
import { MongoClient } from 'mongodb';
import { StorageService } from '../src/services/StorageService.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Tweet, SearchQueryConfig } from '../src/types/twitter.js';
import { RettiwtSearchBuilder } from '../src/core/twitter/rettiwtSearchBuilder.js';
import { TwitterClient } from '../src/core/twitter/twitterClient.js';

// Load environment variables from root .env file
dotenv.config();

// Also load environment variables from tools/.env if it exists
import { existsSync } from 'fs';
import { join } from 'path';

const toolsEnvPath = join(process.cwd(), 'tools', '.env');
if (existsSync(toolsEnvPath)) {
  dotenv.config({ path: toolsEnvPath });
  console.log(chalk.blue('Loaded environment variables from tools/.env'));
}

// Topic names mapping (same as in tweet-category-breakdown.ts)
const TOPIC_NAMES: Record<string, string> = {
  '12111': 'COMPETITOR_TWEETS',
  '12110': 'COMPETITOR_MENTIONS',
  '381': 'TROJAN',
  '6531': 'KOL_MONITORING',
  // Additional topics found in the database
  '5572': 'TOPIC_5572',
  '5573': 'TOPIC_5573',
  '5574': 'TOPIC_5574',
  '6314': 'TOPIC_6314',
  '6317': 'TOPIC_6317',
  '6320': 'TOPIC_6320',
  '6355': 'TOPIC_6355'
};

// Statistics tracking
interface BackfillStats {
  startTime: Date;
  endTime: Date;
  totalTweetsFound: number;
  totalTweetsProcessed: number;
  byTopic: Record<string, {
    found: number;
    processed: number;
  }>;
  byUser: Record<string, number>;
}

/**
 * Normalize usernames by removing @ symbol and converting to lowercase
 */
function normalizeUsernames(accounts: string[]): string[] {
  return accounts.map(account => account.toLowerCase().replace(/^@/, ''));
}

/**
 * Search for tweets with pagination support
 */
async function searchWithPagination(
  twitterClient: TwitterClient,
  searchBuilder: RettiwtSearchBuilder,
  searchType: 'from' | 'mention',
  accounts: string[],
  startTime: Date,
  logger: Logger,
  maxResults: number = 5000 // Increased maximum results to 5000
): Promise<Tweet[]> {
  let allTweets: Tweet[] = [];
  let hasMoreTweets = true;
  let nextToken: string | undefined;
  let pageCount = 0;
  const maxPages = 50; // Safety limit to prevent infinite loops
  
  // Normalize account names
  const normalizedAccounts = normalizeUsernames(accounts);
  
  console.log(chalk.cyan(`Starting paginated search for ${accounts.length} accounts...`));
  logger.info(`Starting paginated search for ${accounts.length} accounts: ${accounts.join(', ')}`);
  
  while (hasMoreTweets && allTweets.length < maxResults && pageCount < maxPages) {
    pageCount++;
    
    // Create search configuration
    const searchConfig: SearchQueryConfig = {
      type: 'structured',
      language: 'en',
      startTime: startTime.toISOString(),
      endTime: new Date().toISOString(),
      excludeRetweets: false, // Include retweets to capture more mentions
      excludeQuotes: false,   // Include quotes to capture more mentions
      cursor: { nextToken, hasMore: true }, // Always assume there might be more
      searchId: `backfill-${searchType}-${Date.now()}`
    };
    
    // Set the appropriate search parameter based on search type
    if (searchType === 'from') {
      searchConfig.accounts = normalizedAccounts;
      searchConfig.advancedFilters = {
        include_replies: true,
        fromUsers: normalizedAccounts // For maximum compatibility
      };
    } else {
      searchConfig.mentions = normalizedAccounts;
      // For mentions, we want to be as inclusive as possible
      searchConfig.advancedFilters = {
        include_replies: true,
        has_links: undefined,  // Don't filter based on links
        has_media: undefined   // Don't filter based on media
      };
    }
    
    // Build filter
    const filter = searchBuilder.buildFilter(searchConfig);
    
    // Log the search parameters for debugging
    console.log(chalk.yellow(`Page ${pageCount}: Searching with parameters:`));
    console.log(chalk.yellow(`  Type: ${searchType}`));
    console.log(chalk.yellow(`  Accounts: ${normalizedAccounts.join(', ')}`));
    console.log(chalk.yellow(`  Date Range: ${startTime.toISOString()} to ${new Date().toISOString()}`));
    console.log(chalk.yellow(`  Include Retweets: ${!searchConfig.excludeRetweets}`));
    console.log(chalk.yellow(`  Include Quotes: ${!searchConfig.excludeQuotes}`));
    console.log(chalk.yellow(`  Next Token: ${nextToken || 'none'}`));
    
    // Execute the search
    const response = await twitterClient.searchTweets(filter);
    
    // Process results
    const tweets = response.data || [];
    allTweets = [...allTweets, ...tweets];
    
    // Update pagination state
    nextToken = response.meta?.next_token;
    
    // Continue pagination even if no next_token, as long as we got results
    // Only stop if we got no results or explicitly reached the end
    hasMoreTweets = tweets.length > 0 && (!!nextToken || pageCount < 3);
    
    console.log(chalk.cyan(`Page ${pageCount}: Retrieved ${tweets.length} tweets (total: ${allTweets.length}), has more: ${hasMoreTweets}`));
    logger.info(`Page ${pageCount}: Retrieved ${tweets.length} tweets (total: ${allTweets.length}), has more: ${hasMoreTweets}`);
    
    // If we got no results but we're still on early pages, try to continue anyway
    if (tweets.length === 0 && pageCount < 3) {
      console.log(chalk.yellow(`No tweets found on page ${pageCount}, but continuing for a few more pages...`));
      // Generate a synthetic next token based on time to try to get more results
      const timeOffset = pageCount * 24 * 60 * 60 * 1000; // 1 day per page
      const newStartTime = new Date(startTime.getTime() - timeOffset);
      console.log(chalk.yellow(`Adjusting start time to: ${newStartTime.toISOString()}`));
    }
    
    // Add delay between pagination requests to respect rate limits
    if (hasMoreTweets) {
      const delayMs = 3000; // Increased delay to be safer with rate limits
      console.log(chalk.gray(`Adding ${delayMs}ms delay between pages...`));
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  if (pageCount >= maxPages) {
    console.log(chalk.yellow(`Reached maximum page limit (${maxPages}). Some tweets may not have been retrieved.`));
    logger.warn(`Reached maximum page limit (${maxPages}). Some tweets may not have been retrieved.`);
  }
  
  // Sort tweets by creation date, newest first
  return allTweets.sort((a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Process accounts in batches
 */
async function processBatches(
  accounts: string[],
  topic: any,
  startTime: Date,
  twitterClient: TwitterClient,
  searchBuilder: RettiwtSearchBuilder,
  tweetProcessor: TweetProcessor,
  rateLimiter: EnhancedRateLimiter,
  circuitBreaker: EnhancedCircuitBreaker,
  logger: Logger
): Promise<[number, number]> {
  let totalTweetsFound = 0;
  let totalTweetsProcessed = 0;
  
  // Create batches of max 10 accounts
  const batchSize = 10;
  const batches: string[][] = [];
  
  for (let i = 0; i < accounts.length; i += batchSize) {
    batches.push(accounts.slice(i, i + batchSize));
  }
  
  console.log(chalk.yellow(`Processing ${accounts.length} accounts in ${batches.length} batches`));
  logger.info(`Processing ${accounts.length} accounts in ${batches.length} batches`);
  
  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    console.log(chalk.yellow(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} accounts`));
    logger.info(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} accounts: ${batch.join(', ')}`);
    
    // Respect rate limits between batches
    if (batchIndex > 0) {
      const batchDelayMs = 5000;
      console.log(chalk.gray(`Adding ${batchDelayMs}ms delay between batches...`));
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
    
    // Determine search type based on topic
    let searchType: 'from' | 'mention';
    if (topic.name === 'KOL_MONITORING') {
      searchType = 'from';
    } else if (topic.name === 'COMPETITOR_MENTIONS' && topic.mentions && topic.mentions.length > 0) {
      searchType = 'mention';
    } else {
      searchType = topic.mentions && topic.mentions.length > 0 ? 'mention' : 'from';
    }
    
    try {
      // Acquire rate limit
      await rateLimiter.acquireRateLimit('backfill', `${topic.id}`);
      
      // Search with pagination using circuit breaker
      const tweets = await circuitBreaker.execute(
        async () => searchWithPagination(
          twitterClient,
          searchBuilder,
          searchType,
          batch,
          startTime,
          logger
        ),
        `backfill:${topic.name}:batch${batchIndex}`
      );
      
      totalTweetsFound += tweets.length;
      
      // Process tweets
      let batchProcessed = 0;
      for (const tweet of tweets) {
        const processed = await tweetProcessor.processTweet(tweet, topic);
        if (processed) {
          batchProcessed++;
          totalTweetsProcessed++;
        }
      }
      
      console.log(chalk.green(`Batch ${batchIndex + 1}: Found ${tweets.length} tweets, processed ${batchProcessed} new tweets`));
      logger.info(`Batch ${batchIndex + 1}: Found ${tweets.length} tweets, processed ${batchProcessed} new tweets`);
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(chalk.red(`Error processing batch ${batchIndex + 1}:`), err.message);
      logger.error(`Error processing batch ${batchIndex + 1}:`, err);
      
      // Add longer delay after error
      const errorDelayMs = 10000;
      console.log(chalk.yellow(`Adding ${errorDelayMs}ms delay after error...`));
      await new Promise(resolve => setTimeout(resolve, errorDelayMs));
    }
  }
  
  return [totalTweetsFound, totalTweetsProcessed];
}

/**
 * Main backfill function
 */
async function runBackfill(startTime: Date): Promise<BackfillStats> {
  // Override environment variables for backfill
  process.env.TWITTER_RATE_LIMIT = '2'; // Increase rate limit to 2 requests per second for backfill
  // Set search window to 24 hours (1440 minutes) for comprehensive backfill
  process.env.SEARCH_WINDOW_MINUTES = '1440'; // 24 hours
  
  // Create container and get services
  const container = createContainer();
  
  // Get services from container
  const logger = container.get<Logger>(TYPES.Logger);
  const configService = container.get<ConfigService>(TYPES.ConfigService);
  const twitterService = container.get<TwitterService>(TYPES.TwitterService);
  const tweetProcessor = container.get<TweetProcessor>(TYPES.TweetProcessor);
  const rateLimiter = container.get<EnhancedRateLimiter>(TYPES.EnhancedRateLimiter);
  const twitterClient = container.get<TwitterClient>(TYPES.TwitterClient);
  const searchBuilder = container.get<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder);
  const storageService = container.get<StorageService>(TYPES.StorageService);
  
  logger.setComponent('BackfillSearch');
  
  // Log the rate limit configuration
  logger.info('Using enhanced rate limit for backfill operation', {
    rateLimit: process.env.TWITTER_RATE_LIMIT,
    searchWindow: process.env.SEARCH_WINDOW_MINUTES
  });
  console.log(chalk.blue(`Using enhanced rate limit: ${process.env.TWITTER_RATE_LIMIT} requests/second`));
  console.log(chalk.blue(`Note: Using maximum allowed search window (${process.env.SEARCH_WINDOW_MINUTES} minutes)`));
  console.log(chalk.blue(`Actual search period: ${startTime.toISOString()} to now (${Math.round((Date.now() - startTime.getTime()) / (60 * 1000))} minutes)`));
  
  // Initialize MongoDB connection
  try {
    logger.info('Initializing MongoDB connection...');
    await storageService.initialize();
    logger.info('MongoDB connection established successfully');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Failed to initialize MongoDB connection:', err);
    logger.warn('Continuing in fallback mode without MongoDB. Some features may be limited.');
  }
  
  console.log(chalk.blue(`Starting backfill from ${chalk.bold(startTime.toISOString())} to now`));
  logger.info(`Starting backfill from ${startTime.toISOString()} to now`);
  
  // Create circuit breaker for Twitter API calls
  const circuitBreaker = new EnhancedCircuitBreaker(logger, {
    threshold: 3,
    resetTimeout: 30000,
    testInterval: 5000,
    monitorInterval: 5000
  });
  
  // Initialize statistics
  const stats: BackfillStats = {
    startTime,
    endTime: new Date(),
    totalTweetsFound: 0,
    totalTweetsProcessed: 0,
    byTopic: {},
    byUser: {}
  };
  
  // Get all topics
  const topics = configService.getTopics();
  
  // Process each topic
  for (const topic of topics) {
    const topicId = topic.id.toString();
    console.log(chalk.yellow(`\nProcessing backfill for topic ${topic.name} (${topicId})`));
    logger.info(`Processing backfill for topic ${topic.name} (${topicId})`);
    
    // Initialize topic stats
    stats.byTopic[topicId] = {
      found: 0,
      processed: 0
    };
    
    // Determine which accounts to use
    let accounts: string[] = [];
    if (topic.name === 'KOL_MONITORING') {
      accounts = [...topic.accounts];
      console.log(chalk.cyan(`Using ${accounts.length} KOL accounts for FROM search`));
    } else if (topic.name === 'COMPETITOR_MENTIONS' && topic.mentions && topic.mentions.length > 0) {
      accounts = [...topic.mentions];
      console.log(chalk.cyan(`Using ${accounts.length} competitor accounts for MENTION search`));
    } else {
      accounts = [...topic.accounts];
      console.log(chalk.cyan(`Using ${accounts.length} accounts for default search`));
    }
    
    if (accounts.length === 0) {
      console.log(chalk.yellow(`No accounts found for topic ${topic.name}, skipping`));
      logger.warn(`No accounts found for topic ${topic.name}, skipping`);
      continue;
    }
    
    // Process accounts in batches
    const [tweetsFound, tweetsProcessed] = await processBatches(
      accounts,
      topic,
      startTime,
      twitterClient,
      searchBuilder,
      tweetProcessor,
      rateLimiter,
      circuitBreaker,
      logger
    );
    
    // Update statistics
    stats.byTopic[topicId].found = tweetsFound;
    stats.byTopic[topicId].processed = tweetsProcessed;
    stats.totalTweetsFound += tweetsFound;
    stats.totalTweetsProcessed += tweetsProcessed;
    
    console.log(chalk.green(`Topic ${topic.name}: Found ${tweetsFound} tweets, processed ${tweetsProcessed} new tweets`));
    logger.info(`Topic ${topic.name}: Found ${tweetsFound} tweets, processed ${tweetsProcessed} new tweets`);
  }
  
  stats.endTime = new Date();
  console.log(chalk.blue('\nBackfill completed successfully'));
  logger.info('Backfill completed successfully');
  
  return stats;
}

/**
 * Display backfill statistics
 */
function displayBackfillStats(stats: BackfillStats): void {
  console.log(chalk.blue('\n=== BACKFILL STATISTICS ==='));
  
  // Duration
  const durationMs = stats.endTime.getTime() - stats.startTime.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);
  console.log(chalk.blue(`\nBackfill period: ${stats.startTime.toISOString()} to ${stats.endTime.toISOString()}`));
  console.log(chalk.blue(`Duration: ${durationMinutes}m ${durationSeconds}s`));
  
  // Overall stats
  console.log(chalk.blue(`\nTotal tweets found: ${chalk.bold(stats.totalTweetsFound.toString())}`));
  console.log(chalk.blue(`Total new tweets processed: ${chalk.bold(stats.totalTweetsProcessed.toString())}`));
  console.log(chalk.blue(`Duplicates skipped: ${chalk.bold((stats.totalTweetsFound - stats.totalTweetsProcessed).toString())}`));
  
  // Breakdown by topic
  console.log(chalk.blue('\nBreakdown by topic:'));
  console.log(chalk.gray('─'.repeat(70)));
  console.log(chalk.gray(`${chalk.bold('Topic ID'.padEnd(10))} | ${chalk.bold('Topic Name'.padEnd(20))} | ${chalk.bold('Found'.padEnd(8))} | ${chalk.bold('Processed'.padEnd(8))} | ${chalk.bold('Duplicates')}`));
  console.log(chalk.gray('─'.repeat(70)));
  
  Object.entries(stats.byTopic).forEach(([topicId, topicStats]) => {
    const topicName = TOPIC_NAMES[topicId] || 'Unknown';
    const duplicates = topicStats.found - topicStats.processed;
    
    console.log(
      `${chalk.cyan(topicId.padEnd(10))} | ${chalk.yellow(topicName.padEnd(20))} | ${chalk.green(topicStats.found.toString().padEnd(8))} | ${chalk.green(topicStats.processed.toString().padEnd(8))} | ${chalk.magenta(duplicates.toString())}`
    );
  });
}

/**
 * Display full database statistics
 */
async function displayFullStatistics(): Promise<void> {
  const mongoUri = process.env.MONGO_DB_STRING;
  
  if (!mongoUri) {
    console.error(chalk.red('Error: MongoDB connection string not found in environment variables.'));
    return;
  }

  console.log(chalk.blue('\nConnecting to MongoDB for full statistics...'));
  
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    
    const dbName = process.env.DB_NAME || 'twitter_notifications';
    const db = client.db(dbName);
    
    const tweetsCollectionName = process.env.TWEETS_COLLECTION || 'tweets';
    const tweetsCollection = db.collection(tweetsCollectionName);
    
    // Get total tweet count
    const totalTweets = await tweetsCollection.countDocuments();
    console.log(chalk.blue(`\nTotal tweets in database: ${chalk.bold(totalTweets.toString())}`));
    
    // Get breakdown by topic
    console.log(chalk.blue('\nBreakdown by topic:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`${chalk.bold('Topic ID'.padEnd(10))} | ${chalk.bold('Topic Name'.padEnd(20))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(50)));
    
    // Aggregate tweets by topicId
    const topicBreakdown = await tweetsCollection.aggregate([
      {
        $group: {
          _id: '$metadata.topicId',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();
    
    // Display results
    for (const topic of topicBreakdown) {
      const topicId = topic._id as string;
      const count = topic.count as number;
      const percentage = ((count / totalTweets) * 100).toFixed(2);
      const topicName = TOPIC_NAMES[topicId] || 'Unknown';
      
      console.log(
        `${chalk.cyan(topicId.padEnd(10))} | ${chalk.yellow(topicName.padEnd(20))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
      );
    }
    
    // Get breakdown by user (top 10)
    console.log(chalk.blue('\nTop 10 users by tweet count:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`${chalk.bold('Username'.padEnd(20))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(50)));
    
    const userBreakdown = await tweetsCollection.aggregate([
      {
        $group: {
          _id: '$tweetBy.userName',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]).toArray();
    
    // Display results
    for (const user of userBreakdown) {
      const username = user._id as string;
      const count = user.count as number;
      const percentage = ((count / totalTweets) * 100).toFixed(2);
      
      console.log(
        `${chalk.cyan(username.padEnd(20))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
      );
    }
    
    // Get breakdown by month
    console.log(chalk.blue('\nTweet count by month:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.gray(`${chalk.bold('Month'.padEnd(15))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(40)));
    
    const monthBreakdown = await tweetsCollection.aggregate([
      {
        $addFields: {
          createdDate: { $toDate: '$createdAt' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdDate' },
            month: { $month: '$createdDate' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]).toArray();
    
    // Display results
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const entry of monthBreakdown) {
      const year = entry._id.year as number;
      const month = months[(entry._id.month as number) - 1];
      const monthYear = `${month} ${year}`;
      const count = entry.count as number;
      const percentage = ((count / totalTweets) * 100).toFixed(2);
      
      console.log(
        `${chalk.cyan(monthYear.padEnd(15))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
      );
    }
    
  } catch (error) {
    console.error(chalk.red('Error connecting to MongoDB:'), error);
  } finally {
    if (client) {
      await client.close();
      console.log(chalk.blue('\nMongoDB connection closed.'));
    }
  }
}

// Parse command line arguments
function parseArgs(): { startTime: Date, maxResults: number } {
  const args = process.argv.slice(2);
  let startTimeArg: string | undefined;
  let maxResultsArg: string | undefined;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' || args[i] === '-s') {
      startTimeArg = args[i + 1];
      i++;
    } else if (args[i] === '--max' || args[i] === '-m') {
      maxResultsArg = args[i + 1];
      i++;
    } else if (!startTimeArg && !args[i].startsWith('-')) {
      // Assume first non-flag argument is the start time
      startTimeArg = args[i];
    }
  }
  
  // Default to 24 hours ago if not specified
  const startTime = startTimeArg 
    ? new Date(startTimeArg) 
    : new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Default to 1000 max results if not specified
  const maxResults = maxResultsArg ? parseInt(maxResultsArg, 10) : 1000;
  
  return { startTime, maxResults };
}

// Display usage information
function displayUsage(): void {
  console.log(chalk.blue('\nUsage: npx tsx tools/backfill-search.ts [options] [start-time]'));
  console.log(chalk.blue('\nOptions:'));
  console.log(chalk.blue('  --start, -s <time>    Start time for backfill (ISO format or any valid date string)'));
  console.log(chalk.blue('  --max, -m <number>    Maximum tweets to retrieve per topic (default: 1000)'));
  console.log(chalk.blue('\nExamples:'));
  console.log(chalk.blue('  npx tsx tools/backfill-search.ts                           # Backfill last 24 hours'));
  console.log(chalk.blue('  npx tsx tools/backfill-search.ts "2025-03-14T00:00:00Z"    # Backfill since specific time'));
  console.log(chalk.blue('  npx tsx tools/backfill-search.ts -m 500                    # Limit to 500 tweets per topic'));
}

// Main function
async function main(): Promise<void> {
  console.log(chalk.blue('\n=== TWITTER BACKFILL TOOL ==='));
  
  // Parse command line arguments
  const { startTime, maxResults } = parseArgs();
  
  // Display usage if --help flag is present
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    displayUsage();
    return;
  }
  
  try {
    // Run the backfill
    const stats = await runBackfill(startTime);
    
    // Display statistics
    displayBackfillStats(stats);
    
    // Display full database statistics
    await displayFullStatistics();
    
  } catch (error) {
    console.error(chalk.red('\nBackfill failed:'), error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});
