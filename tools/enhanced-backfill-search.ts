#!/usr/bin/env tsx
import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { TwitterService } from '../src/services/TwitterService.js';
import { TweetProcessor } from '../src/services/TweetProcessor.js';
import { EnhancedRateLimiter } from '../src/utils/enhancedRateLimiter.js';
import { EnhancedCircuitBreaker } from '../src/utils/enhancedCircuitBreaker.js';
import { RettiwtErrorHandler } from '../src/core/twitter/RettiwtErrorHandler.js';
import { MongoClient } from 'mongodb';
import { StorageService } from '../src/services/StorageService.js';
import { MetricsManager } from '../src/core/monitoring/MetricsManager.js';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { Tweet, SearchQueryConfig } from '../src/types/twitter.js';
import { RettiwtSearchBuilder } from '../src/core/twitter/rettiwtSearchBuilder.js';
import { TwitterClient } from '../src/core/twitter/twitterClient.js';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

// Load environment variables
dotenv.config();
const toolsEnvPath: string = join(process.cwd(), 'tools', '.env');
if (existsSync(toolsEnvPath)) {
  dotenv.config({ path: toolsEnvPath });
  console.log(chalk.blue('Loaded environment variables from tools/.env'));
}

/* ===================== Types for CSV Export ===================== */
interface ExportRow {
  author: string;             // The real tweet author
  competitor: string;         // The competitor account we searched for
  tweetId: string;
  createdAt: string;
  content: string;
  mentionedAccounts: string;
  searchType: 'from' | 'mention';
}

/** We collect rows here if export is enabled */
const exportData: ExportRow[] = [];
let exportCSV: boolean = false;

/* ===================== Main Types ===================== */
interface TimePeriod {
  name: string;
  startDate: Date;
}

interface AccountStats {
  account: string;
  fromTweets: { found: number; processed: number };
  mentionTweets: { found: number; processed: number };
}

interface BackfillStats {
  startTime: Date;
  endTime: Date;
  totalTweetsFound: number;
  totalTweetsProcessed: number;
  byAccount: { [account: string]: AccountStats };
  byTopic: { [topicId: string]: { found: number; processed: number } };
  byPeriod: { [period: string]: { found: number; processed: number } };
}

/* ===================== Constants & Helpers ===================== */
const TOPIC_NAMES: { [key: string]: string } = {
  '12111': 'COMPETITOR_TWEETS',
  '12110': 'COMPETITOR_MENTIONS',
  '381': 'TROJAN',
  '6531': 'KOL_MONITORING',
  '5572': 'TOPIC_5572',
  '5573': 'TOPIC_5573',
  '5574': 'TOPIC_5574',
  '6314': 'TOPIC_6314',
  '6317': 'TOPIC_6317',
  '6320': 'TOPIC_6320',
  '6355': 'TOPIC_6355'
};

const DEFAULT_MAX_RESULTS: number = 5000;
const PAGE_DELAY_MS: number = 3000;
const SEARCH_TYPE_DELAY_MS: number = 5000;
const PERIOD_DELAY_MS: number = 5000;
const ACCOUNT_DELAY_MS: number = 10000;
const BASE_RATE_LIMIT: string = process.env.TWITTER_RATE_LIMIT || '2';

/** Sleep helper */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate an extended search window from environment vars.
 */
function getSearchWindow(baseStartTime: Date): { effectiveStartTime: Date; computedEndTime: Date } {
  const windowMinutes: number = parseInt(process.env.SEARCH_WINDOW_MINUTES || '1440', 10);
  const overlapMinutes: number = parseInt(process.env.OVERLAP_BUFFER_MINUTES || '2', 10);
  const overlapMs: number = overlapMinutes * 60 * 1000;
  const effectiveStartTime: Date = new Date(baseStartTime.getTime() - overlapMs);
  const candidateEnd: Date = new Date(baseStartTime.getTime() + windowMinutes * 60 * 1000);
  const computedEndTime: Date = candidateEnd > new Date() ? new Date() : candidateEnd;
  return { effectiveStartTime, computedEndTime };
}

/**
 * Return predefined time periods or a custom one.
 */
function getTimePeriods(customStartTime?: Date): TimePeriod[] {
  const now = new Date();
  if (customStartTime) return [{ name: 'Custom', startDate: customStartTime }];
  return [
    { name: 'Last 24 hours', startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    { name: 'Last 7 days', startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
    { name: 'Last 30 days', startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) }
  ];
}

/**
 * Normalize Twitter account names (remove '@', toLowerCase).
 */
function normalizeUsernames(accounts: string[]): string[] {
  return accounts.map((acc: string) => acc.toLowerCase().replace(/^@/, ''));
}

/**
 * Retrieve competitor accounts from config, or default.
 */
function getCompetitorAccounts(configService: ConfigService): string[] {
  const topics = configService.getTopics();
  const compTopic = topics.find(topic => topic.id.toString() === '12110');
  if (!compTopic || !compTopic.mentions?.length) {
    console.log(chalk.yellow('No competitor accounts found in topic 12110, using default list'));
    return [
      'tradewithphoton',
      'bullx_io',
      'gmgnai',
      'tradeonnova',
      'bonkbot_io',
      'bloomtradingbot',
      'maestrobots',
      'trojanonsolana'
    ];
  }
  return compTopic.mentions;
}

/* ===================== Twitter Search ===================== */

/**
 * Search for tweets with pagination, removing duplicates in each search.
 */
async function searchWithPagination(
  twitterClient: TwitterClient,
  searchBuilder: RettiwtSearchBuilder,
  searchType: 'from' | 'mention',
  accounts: string[],
  baseStartTime: Date,
  logger: Logger,
  maxResults: number = DEFAULT_MAX_RESULTS
): Promise<Tweet[]> {
  const allTweets: Tweet[] = [];
  const seenTweetIds = new Set<string>(); // track IDs to remove duplicates

  let nextToken: string | undefined;
  let pageCount = 0;
  const maxPages = 50;
  const normalizedAccounts = normalizeUsernames(accounts);
  logger.info(`Starting ${searchType} search for: ${normalizedAccounts.join(', ')}`);

  // Extended search window
  const { effectiveStartTime, computedEndTime } = getSearchWindow(baseStartTime);
  logger.info(`Using search window: ${effectiveStartTime.toISOString()} to ${computedEndTime.toISOString()}`);

  while (allTweets.length < maxResults && pageCount < maxPages) {
    pageCount++;
    const searchConfig: SearchQueryConfig = {
      type: 'structured',
      language: 'en',
      startTime: effectiveStartTime.toISOString(),
      endTime: computedEndTime.toISOString(),
      excludeRetweets: false,
      excludeQuotes: false,
      cursor: { nextToken, hasMore: true },
      searchId: `backfill-${searchType}-${Date.now()}`
    };

    if (searchType === 'from') {
      searchConfig.accounts = normalizedAccounts;
      searchConfig.advancedFilters = { include_replies: true, fromUsers: normalizedAccounts };
    } else {
      searchConfig.mentions = normalizedAccounts;
      searchConfig.advancedFilters = { include_replies: true };
    }

    const filter: any = searchBuilder.buildFilter(searchConfig);
    logger.debug(`Page ${pageCount} params:`, { searchType, accounts: normalizedAccounts, nextToken });
    const response: { data?: Tweet[]; meta?: { next_token?: string } } = await twitterClient.searchTweets(filter);
    const tweets: Tweet[] = response.data || [];

    // Collect only unique tweets
    for (const t of tweets) {
      if (!seenTweetIds.has(t.id)) {
        seenTweetIds.add(t.id);
        allTweets.push(t);
      }
    }

    nextToken = response.meta?.next_token;

    // If no tweets on an early page, we keep going a bit
    if (tweets.length === 0 && pageCount < 3) {
      logger.warn(`No tweets found on page ${pageCount}, but continuing for a few more pages...`);
      const timeOffset = pageCount * 24 * 60 * 60 * 1000;
      const newStartTime = new Date(baseStartTime.getTime() - timeOffset);
      logger.warn(`Adjusting start time to: ${newStartTime.toISOString()}`);
    }

    const hasMore = tweets.length > 0 && (nextToken || pageCount < 3);
    logger.info(`Page ${pageCount}: Retrieved ${tweets.length} tweets (unique total: ${allTweets.length})`);
    if (hasMore) await sleep(PAGE_DELAY_MS);
    else break;
  }

  if (pageCount >= maxPages)
    logger.warn(`Reached maximum page limit (${maxPages}). Some tweets may not have been retrieved.`);

  // Sort final unique tweets by newest first
  return allTweets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Process tweets for a given search type (FROM or MENTION).
 */
async function processSearchType(
  searchType: 'from' | 'mention',
  accounts: string[],
  baseStartTime: Date,
  twitterClient: TwitterClient,
  searchBuilder: RettiwtSearchBuilder,
  tweetProcessor: TweetProcessor,
  rateLimiter: EnhancedRateLimiter,
  circuitBreaker: EnhancedCircuitBreaker,
  logger: Logger,
  topicId: string,
  rettiwtErrorHandler: RettiwtErrorHandler
): Promise<[number, number]> {
  let tweetsFound = 0;
  let tweetsProcessed = 0;

  try {
    if (rettiwtErrorHandler.isInCooldown()) {
      const remaining = Math.ceil(rettiwtErrorHandler.getRemainingCooldown() / 1000);
      logger.warn(`Cooldown active (${remaining}s remaining). Skipping search for ${accounts.join(', ')}`);
      await sleep(5000);
      return [0, 0];
    }

    await rateLimiter.acquireRateLimit('backfill', `${topicId}-${searchType}`);
    logger.info(`[SEARCH] ${searchType.toUpperCase()} for: ${accounts.join(', ')}`);

    // Run the circuit breaker to call searchWithPagination
    const tweets = await circuitBreaker.execute(
      () => searchWithPagination(twitterClient, searchBuilder, searchType, accounts, baseStartTime, logger),
      `backfill:${searchType}:${accounts.join(',')}`
    );

    tweetsFound = tweets.length;

    // Build a "topic" object
    const topic = {
      id: parseInt(topicId, 10),
      name: TOPIC_NAMES[topicId] || 'Unknown',
      accounts: searchType === 'from' ? accounts : [],
      mentions: searchType === 'mention' ? accounts : []
    };

    // Process each tweet
    for (const tweet of tweets) {
      // CSV Export: real author is tweet.tweetBy.userName, competitor is accounts[0]
      if (exportCSV) {
        const realAuthor = tweet.tweetBy.userName; // the actual tweet author
        const competitor = accounts[0];            // the competitor we searched for
        const mentioned = tweet.entities?.mentionedUsers
          ? tweet.entities.mentionedUsers.join(';')
          : '';

        // Add a row (you can rename or add columns as you wish)
        exportData.push({
          author: realAuthor,
          competitor,
          tweetId: tweet.id,
          createdAt: tweet.createdAt,
          content: tweet.text,
          mentionedAccounts: mentioned,
          searchType
        });
      }

      // The standard tweet processing
      const processed = await tweetProcessor.processTweet(tweet, topic);
      if (processed) tweetsProcessed++;
    }

    logger.info(`${searchType.toUpperCase()} search for ${accounts.join(', ')}: Found ${tweetsFound}, processed ${tweetsProcessed}`);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const isRateLimitError = /TOO_MANY_REQUESTS|rate limit/i.test(err.message);
    logger.error(`Error processing ${searchType} search for ${accounts.join(', ')}: ${err.message}`);

    if (isRateLimitError) {
      const backoffMultiplier = Math.min(60, Math.pow(2, 5));
      const cooldownMs = 30000 * backoffMultiplier;
      try {
        if (typeof rettiwtErrorHandler.handleRettiwtError === 'function') {
          rettiwtErrorHandler.handleRettiwtError({
            message: 'Rate limit exceeded',
            status: 429,
            headers: { 'x-rate-limit-reset': (Math.floor(Date.now() / 1000) + cooldownMs / 1000).toString() }
          });
        }
        logger.warn(`Applied rate limit cooldown of ${cooldownMs}ms`);
      } catch (e) {
        logger.error(`Cooldown error: ${String(e)}`);
      }
      await sleep(30000);
    } else {
      await sleep(10000);
    }
  }

  return [tweetsFound, tweetsProcessed];
}

/**
 * Process a single account with both FROM and MENTION searches.
 */
async function processAccount(
  account: string,
  baseStartTime: Date,
  twitterClient: TwitterClient,
  searchBuilder: RettiwtSearchBuilder,
  tweetProcessor: TweetProcessor,
  rateLimiter: EnhancedRateLimiter,
  circuitBreaker: EnhancedCircuitBreaker,
  logger: Logger,
  topicId: string,
  rettiwtErrorHandler: RettiwtErrorHandler
): Promise<AccountStats> {
  const stats: AccountStats = {
    account,
    fromTweets: { found: 0, processed: 0 },
    mentionTweets: { found: 0, processed: 0 }
  };

  logger.info(`Processing account ${account} for period starting ${baseStartTime.toISOString()}`);

  // FROM search
  const [fromFound, fromProcessed] = await processSearchType(
    'from',
    [account],
    baseStartTime,
    twitterClient,
    searchBuilder,
    tweetProcessor,
    rateLimiter,
    circuitBreaker,
    logger,
    topicId,
    rettiwtErrorHandler
  );
  stats.fromTweets = { found: fromFound, processed: fromProcessed };
  await sleep(SEARCH_TYPE_DELAY_MS);

  // MENTION search
  const [mentionFound, mentionProcessed] = await processSearchType(
    'mention',
    [account],
    baseStartTime,
    twitterClient,
    searchBuilder,
    tweetProcessor,
    rateLimiter,
    circuitBreaker,
    logger,
    topicId,
    rettiwtErrorHandler
  );
  stats.mentionTweets = { found: mentionFound, processed: mentionProcessed };

  return stats;
}

/**
 * Main backfill function.
 */
async function runBackfill(args: {
  startTime?: Date;
  maxResults: number;
  accounts: string[];
  allPeriods: boolean;
}): Promise<BackfillStats> {
  process.env.TWITTER_RATE_LIMIT = BASE_RATE_LIMIT;

  const container = createContainer();
  const logger = container.get<Logger>(TYPES.Logger);
  const configService = container.get<ConfigService>(TYPES.ConfigService);
  const tweetProcessor = container.get<TweetProcessor>(TYPES.TweetProcessor);
  const rateLimiter = container.get<EnhancedRateLimiter>(TYPES.EnhancedRateLimiter);
  const twitterClient = container.get<TwitterClient>(TYPES.TwitterClient);
  const searchBuilder = container.get<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder);
  const storageService = container.get<StorageService>(TYPES.StorageService);

  logger.setComponent('EnhancedBackfillSearch');
  logger.info('Starting enhanced backfill', {
    rateLimit: process.env.TWITTER_RATE_LIMIT,
    searchWindow: process.env.SEARCH_WINDOW_MINUTES,
    overlapBuffer: process.env.OVERLAP_BUFFER_MINUTES
  });
  console.log(chalk.blue(`Rate limit: ${process.env.TWITTER_RATE_LIMIT} req/s, search window: ${process.env.SEARCH_WINDOW_MINUTES} minutes`));

  try {
    logger.info('Initializing MongoDB...');
    await storageService.initialize();
    logger.info('MongoDB connected successfully');
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('MongoDB init failed:', err);
    console.log(chalk.yellow('Continuing without MongoDB features.'));
  }

  // Create a proper instance of MetricsManager
  const metricsManager = container.get<MetricsManager>(TYPES.MetricsManager);

  const rettiwtErrorHandler = new RettiwtErrorHandler(logger, metricsManager);
  const circuitBreaker = new EnhancedCircuitBreaker(logger, {
    threshold: 5,
    resetTimeout: 60000,
    testInterval: 10000,
    monitorInterval: 5000
  });

  const competitorAccounts = args.accounts.length > 0 ? args.accounts : getCompetitorAccounts(configService);
  console.log(chalk.yellow(`Processing competitor accounts: ${competitorAccounts.join(', ')}`));

  const timePeriods = args.allPeriods
    ? getTimePeriods()
    : args.startTime
      ? [{ name: 'Custom', startDate: args.startTime }]
      : [getTimePeriods()[0]];

  console.log(chalk.yellow(`Time periods: ${timePeriods.map(p => p.name).join(', ')}`));

  const stats: BackfillStats = {
    startTime: args.startTime || new Date(),
    endTime: new Date(),
    totalTweetsFound: 0,
    totalTweetsProcessed: 0,
    byAccount: {},
    byTopic: {
      '12110': { found: 0, processed: 0 },
      '12111': { found: 0, processed: 0 }
    },
    byPeriod: {}
  };

  for (const account of competitorAccounts) {
    stats.byAccount[account] = {
      account,
      fromTweets: { found: 0, processed: 0 },
      mentionTweets: { found: 0, processed: 0 }
    };

    for (const period of timePeriods) {
      logger.info(`Processing ${account} for period: ${period.name}`);
      if (!stats.byPeriod[period.name]) {
        stats.byPeriod[period.name] = { found: 0, processed: 0 };
      }

      const accountStats = await processAccount(
        account,
        period.startDate,
        twitterClient,
        searchBuilder,
        tweetProcessor,
        rateLimiter,
        circuitBreaker,
        logger,
        '12110', // topic ID for competitor mentions
        rettiwtErrorHandler
      );

      // Update stats
      stats.byAccount[account].fromTweets.found += accountStats.fromTweets.found;
      stats.byAccount[account].fromTweets.processed += accountStats.fromTweets.processed;
      stats.byAccount[account].mentionTweets.found += accountStats.mentionTweets.found;
      stats.byAccount[account].mentionTweets.processed += accountStats.mentionTweets.processed;

      // COMPETITOR_MENTIONS => 12110 (for tweets that mention the competitor)
      stats.byTopic['12110'].found += accountStats.mentionTweets.found;
      stats.byTopic['12110'].processed += accountStats.mentionTweets.processed;

      // COMPETITOR_TWEETS => 12111 (for tweets from competitor)
      stats.byTopic['12111'].found += accountStats.fromTweets.found;
      stats.byTopic['12111'].processed += accountStats.fromTweets.processed;

      stats.byPeriod[period.name].found += accountStats.fromTweets.found + accountStats.mentionTweets.found;
      stats.byPeriod[period.name].processed += accountStats.fromTweets.processed + accountStats.mentionTweets.processed;
      stats.totalTweetsFound += accountStats.fromTweets.found + accountStats.mentionTweets.found;
      stats.totalTweetsProcessed += accountStats.fromTweets.processed + accountStats.mentionTweets.processed;

      if (timePeriods.length > 1) {
        await sleep(PERIOD_DELAY_MS);
      }
    }

    if (competitorAccounts.indexOf(account) < competitorAccounts.length - 1) {
      await sleep(ACCOUNT_DELAY_MS);
    }
  }

  stats.endTime = new Date();
  logger.info('Enhanced backfill completed successfully');
  console.log(chalk.blue('\nEnhanced backfill completed successfully'));
  return stats;
}

/**
 * Display backfill statistics at the end.
 */
function displayEnhancedBackfillStats(stats: BackfillStats): void {
  console.log(chalk.blue('\n=== ENHANCED BACKFILL STATISTICS ==='));
  const durationMs = stats.endTime.getTime() - stats.startTime.getTime();
  const durationMinutes = Math.floor(durationMs / 60000);
  const durationSeconds = Math.floor((durationMs % 60000) / 1000);

  console.log(chalk.blue(`\nPeriod: ${stats.startTime.toISOString()} to ${stats.endTime.toISOString()}`));
  console.log(chalk.blue(`Duration: ${durationMinutes}m ${durationSeconds}s`));
  console.log(chalk.blue(`\nTotal tweets found: ${stats.totalTweetsFound}`));
  console.log(chalk.blue(`New tweets processed: ${stats.totalTweetsProcessed}`));
  console.log(chalk.blue(`Duplicates skipped: ${stats.totalTweetsFound - stats.totalTweetsProcessed}`));

  console.log(chalk.blue('\nBreakdown by account:'));
  console.log(chalk.gray('─'.repeat(100)));
  console.log(
    chalk.gray(
      `${'Account'.padEnd(20)} | ${'FROM Tweets'.padEnd(25)} | ${'MENTION Tweets'.padEnd(25)} | ${'Total'.padEnd(15)}`
    )
  );
  console.log(chalk.gray('─'.repeat(100)));

  Object.entries(stats.byAccount).forEach(([account, accStats]) => {
    const totalFound = accStats.fromTweets.found + accStats.mentionTweets.found;
    const totalProcessed = accStats.fromTweets.processed + accStats.mentionTweets.processed;
    console.log(
      `${chalk.cyan(account.padEnd(20))} | ${chalk.green(String(accStats.fromTweets.found).padEnd(10))} ` +
        `${chalk.green(String(accStats.fromTweets.processed).padEnd(10))} | ` +
        `${chalk.green(String(accStats.mentionTweets.found).padEnd(10))} ` +
        `${chalk.green(String(accStats.mentionTweets.processed).padEnd(10))} | ` +
        `${chalk.magenta(String(totalFound).padEnd(7))} ${chalk.magenta(String(totalProcessed))}`
    );
  });

  console.log(chalk.blue('\nBreakdown by topic:'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.gray(`${'Topic ID'.padEnd(10)} | ${'Topic Name'.padEnd(20)} | ${'Found'.padEnd(8)} | Processed`));
  console.log(chalk.gray('─'.repeat(50)));

  Object.entries(stats.byTopic).forEach(([topicId, tStats]) => {
    const topicName = TOPIC_NAMES[topicId] || 'Unknown';
    console.log(
      `${chalk.cyan(topicId.padEnd(10))} | ${chalk.yellow(topicName.padEnd(20))} | ` +
        `${chalk.green(String(tStats.found).padEnd(8))} | ${chalk.green(String(tStats.processed))}`
    );
  });

  if (Object.keys(stats.byPeriod).length > 1) {
    console.log(chalk.blue('\nBreakdown by time period:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`${'Period'.padEnd(20)} | ${'Found'.padEnd(10)} | Processed`));
    console.log(chalk.gray('─'.repeat(50)));
    Object.entries(stats.byPeriod).forEach(([periodName, pStats]) => {
      console.log(
        `${chalk.cyan(periodName.padEnd(20))} | ` +
          `${chalk.green(String(pStats.found).padEnd(10))} | ` +
          `${chalk.green(String(pStats.processed))}`
      );
    });
  }
}

/**
 * Parse command line arguments.
 */
function parseArgs(): {
  startTime?: Date;
  maxResults: number;
  accounts: string[];
  allPeriods: boolean;
} {
  const args = process.argv.slice(2);
  let startTimeArg: string | undefined;
  let maxResultsArg: string | undefined;
  const accounts: string[] = [];
  let allPeriods = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--start' || args[i] === '-s') {
      startTimeArg = args[++i];
    } else if (args[i] === '--max' || args[i] === '-m') {
      maxResultsArg = args[++i];
    } else if (args[i] === '--account' || args[i] === '-a') {
      accounts.push(args[++i]);
    } else if (args[i] === '--all-periods') {
      allPeriods = true;
    } else if (args[i] === '--export-csv' || args[i] === '-e') {
      exportCSV = true;
    } else if (!startTimeArg && !args[i].startsWith('-')) {
      // first non-flag argument is the start time
      startTimeArg = args[i];
    }
  }

  return {
    startTime: startTimeArg ? new Date(startTimeArg) : undefined,
    maxResults: maxResultsArg ? parseInt(maxResultsArg, 10) : DEFAULT_MAX_RESULTS,
    accounts,
    allPeriods
  };
}

/**
 * Display usage info.
 */
function displayUsage(): void {
  console.log(chalk.blue('\nUsage: npx tsx tools/enhanced-backfill-search.ts [options]'));
  console.log(chalk.blue('\nOptions:'));
  console.log(chalk.blue('  --start, -s <time>      Start time (ISO or valid date string)'));
  console.log(chalk.blue('  --max, -m <number>      Maximum tweets per search (default: 5000)'));
  console.log(chalk.blue('  --account, -a <account> Specific account (repeatable)'));
  console.log(chalk.blue('  --all-periods           Process all time periods'));
  console.log(chalk.blue('  --export-csv, -e        Export detailed tweet data to CSV'));
  console.log(chalk.blue('  --help, -h              Show help message'));
}

/**
 * Optionally export the CSV at the end.
 */
function exportToCSV(data: ExportRow[], filePath: string): void {
  const header = ['Author', 'Competitor', 'TweetID', 'CreatedAt', 'Content', 'MentionedAccounts', 'SearchType'];
  const csvRows = [header.join(',')];

  // Simple CSV escaping: wrap text in quotes, double up internal quotes
  function escape(str: string): string {
    return `"${str.replace(/"/g, '""')}"`;
  }

  for (const row of data) {
    csvRows.push([
      row.author,
      row.competitor,
      row.tweetId,
      row.createdAt,
      escape(row.content),
      escape(row.mentionedAccounts),
      row.searchType
    ].join(','));
  }

  writeFileSync(filePath, csvRows.join('\n'));
  console.log(chalk.blue(`Exported ${data.length} tweet rows to CSV at ${filePath}`));
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  console.log(chalk.blue('\n=== ENHANCED TWITTER BACKFILL TOOL ==='));
  const args = parseArgs();

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    displayUsage();
    return;
  }

  try {
    const stats = await runBackfill(args);
    displayEnhancedBackfillStats(stats);

    // If export was requested and we have data, write the CSV
    if (exportCSV && exportData.length > 0) {
      const filePath = join(process.cwd(), `export_${Date.now()}.csv`);
      exportToCSV(exportData, filePath);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(chalk.red('\nBackfill failed:'), err);
    process.exit(1);
  }
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(chalk.red('Unhandled error:'), err);
  process.exit(1);
});
