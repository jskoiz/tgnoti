#!/usr/bin/env node

/**
 * Standalone Mass Tracking Service
 * This service runs independently from the main application and focuses solely on MASS_TRACKING
 */

import 'reflect-metadata';
import { config } from 'dotenv';
import { createContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { TwitterService } from '../src/services/TwitterService.js';
import { TweetProcessor } from '../src/services/TweetProcessor.js';
import { StorageService } from '../src/services/StorageService.js';
import { MongoDBService } from '../src/services/MongoDBService.js';
import { CsvAccountLoader, CsvAccount } from '../src/services/CsvAccountLoader.js';
import { EnhancedMetricsManager } from '../src/core/monitoring/EnhancedMetricsManager.js';
import { EnhancedCircuitBreaker } from '../src/utils/enhancedCircuitBreaker.js';
import { EnhancedRateLimiter } from '../src/utils/enhancedRateLimiter.js';
import { RettiwtErrorHandler } from '../src/core/twitter/RettiwtErrorHandler.js';
import { LoggerFactory } from '../src/logging/LoggerFactory.js';

class MassTrackingService {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private shutdownRequested: boolean = false;
  private csvAccounts: CsvAccount[] = [];
  private csvPath: string = 'list.csv';
  private lastPollTime: Date = new Date();
  private circuitBreakers: Map<string, EnhancedCircuitBreaker> = new Map();
  private accountBatches: string[][] = [];

  constructor(
    private logger: Logger,
    private config: ConfigService,
    private twitter: TwitterService,
    private processor: TweetProcessor,
    private storage: StorageService,
    private mongoService: MongoDBService,
    private csvLoader: CsvAccountLoader,
    private metrics: EnhancedMetricsManager,
    private rateLimiter: EnhancedRateLimiter,
    private rettiwtErrorHandler: RettiwtErrorHandler
  ) {
    this.logger.setComponent('MassTrackingService');
    this.initializeCircuitBreakers();
  }

  /**
   * Initialize circuit breakers for mass tracking operations
   */
  private initializeCircuitBreakers(): void {
    // Search circuit breaker (lenient for 404s)
    const searchCB = new EnhancedCircuitBreaker(this.logger, {
      threshold: 5,
      resetTimeout: 60000,
      testInterval: 10000,
      monitorInterval: 10000
    });
    this.circuitBreakers.set('twitter_search', searchCB);

    // Timeline circuit breaker (strict for rate limits)
    const timelineCB = new EnhancedCircuitBreaker(this.logger, {
      threshold: 2,
      resetTimeout: 120000,
      testInterval: 15000,
      monitorInterval: 15000
    });
    this.circuitBreakers.set('twitter_timeline', timelineCB);

    this.logger.info('Circuit breakers initialized for mass tracking');
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Mass Tracking Service...');
    
    // Initialize storage
    await this.storage.initialize();
    
    // Load CSV accounts
    await this.loadCsvAccounts();
    
    // Create account batches
    this.createAccountBatches();
    
    this.logger.info('Mass Tracking Service initialized successfully');
  }

  /**
   * Load CSV accounts for mass tracking
   */
  private async loadCsvAccounts(): Promise<void> {
    try {
      this.logger.info(`Loading CSV accounts from: ${this.csvPath}`);
      this.csvAccounts = await this.csvLoader.loadAccountsFromCsv(this.csvPath);
      this.logger.info(`Successfully loaded ${this.csvAccounts.length} accounts for mass tracking`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to load CSV accounts: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Create batches of accounts for optimal processing
   */
  private createAccountBatches(): void {
    const accounts = this.csvAccounts.map(account => account.username);
    const targetBatches = 10; // Target number of batches for faster processing
    const batchSize = Math.ceil(accounts.length / targetBatches); // Calculate batch size to get ~10 batches
    
    this.accountBatches = [];
    for (let i = 0; i < accounts.length; i += batchSize) {
      this.accountBatches.push(accounts.slice(i, i + batchSize));
    }
    
    this.logger.info(`Created ${this.accountBatches.length} batches of ${batchSize} accounts each for mass tracking`);
  }

  /**
   * Get the MASS_TRACKING topic configuration
   */
  private getMassTrackingTopic(): any {
    const topics = this.config.getTopics();
    const massTrackingTopic = topics.find(t => t.name === 'MASS_TRACKING');
    
    if (!massTrackingTopic) {
      throw new Error('MASS_TRACKING topic not found in configuration');
    }

    // Update topic accounts with CSV accounts for proper filtering
    massTrackingTopic.accounts = this.csvAccounts.map(account => account.username);
    
    return massTrackingTopic;
  }

  /**
   * Start the mass tracking service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Mass tracking service is already running');
      return;
    }

    const twitterConfig = this.config.getTwitterConfig();
    const pollingInterval = twitterConfig.rateLimit.pollingIntervalMs;

    this.isRunning = true;
    this.shutdownRequested = false;
    this.logger.info(`Starting mass tracking service with ${pollingInterval}ms interval`);
    this.logger.info(`Monitoring ${this.csvAccounts.length} accounts in ${this.accountBatches.length} batches`);

    // Initial run with delay
    setTimeout(() => {
      if (!this.shutdownRequested) {
        this.run().catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Error in initial mass tracking cycle:', err);
        });
      }
    }, 5000);

    // Set up monitoring interval
    this.monitoringInterval = setInterval(() => {
      if (this.shutdownRequested) {
        return;
      }

      this.run().catch(error => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Error in mass tracking cycle:', err);
      });
    }, pollingInterval);
  }

  /**
   * Run a mass tracking cycle
   */
  private async run(): Promise<void> {
    const startTime = Date.now();
    this.metrics.increment('mass_tracking.cycles');

    try {
      this.logger.info('[MASS TRACKING CYCLE] Starting mass tracking cycle...');
      
      // Check for global cooldown
      if (this.rettiwtErrorHandler.isInCooldown()) {
        const remainingCooldown = Math.ceil(this.rettiwtErrorHandler.getRemainingCooldown() / 1000);
        this.logger.warn(`[RATE LIMIT PROTECTION] Skipping mass tracking cycle due to global cooldown (${remainingCooldown}s remaining)`);
        return;
      }

      const topic = this.getMassTrackingTopic();
      const searchStartTime = new Date(this.lastPollTime.getTime() - (5 * 60 * 1000)); // 5 minute overlap
      const searchEndTime = new Date();
      
      this.logger.info(`Mass tracking search window: ${searchStartTime.toISOString()} to ${searchEndTime.toISOString()}`);
      
      let totalTweetsFound = 0;
      let totalTweetsProcessed = 0;

      // Process each batch
      for (let batchIndex = 0; batchIndex < this.accountBatches.length; batchIndex++) {
        const batch = this.accountBatches[batchIndex];
        
        try {
          // Add delay between batches
          if (batchIndex > 0) {
            const batchDelayMs = 3000; // 3 second delay between batches
            this.logger.debug(`Adding ${batchDelayMs}ms delay between batches`);
            await new Promise(resolve => setTimeout(resolve, batchDelayMs));
          }

          this.logger.info(`[BATCH ${batchIndex + 1}/${this.accountBatches.length}] Processing ${batch.length} accounts: ${batch.slice(0, 3).join(', ')}${batch.length > 3 ? '...' : ''}`);
          
          const [tweetsFound, tweetsProcessed] = await this.processAccountBatch(batch, topic, searchStartTime);
          totalTweetsFound += tweetsFound;
          totalTweetsProcessed += tweetsProcessed;

          this.logger.info(`[BATCH ${batchIndex + 1}/${this.accountBatches.length}] Found ${tweetsFound} tweets, processed ${tweetsProcessed}`);
          
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Error processing batch ${batchIndex + 1}/${this.accountBatches.length}:`, err);
          
          // Add longer delay after error
          if (batchIndex < this.accountBatches.length - 1) {
            const errorDelayMs = 10000; // 10 seconds
            this.logger.info(`Adding ${errorDelayMs}ms delay after batch error`);
            await new Promise(resolve => setTimeout(resolve, errorDelayMs));
          }
        }
      }

      this.lastPollTime = searchEndTime;
      
      // Persist metrics
      await this.metrics.persistMetrics();
      
      const duration = Date.now() - startTime;
      this.logger.info(`[MASS TRACKING COMPLETE] Cycle finished: ${totalTweetsFound} tweets found, ${totalTweetsProcessed} processed in ${duration}ms`);
      
      this.metrics.timing('mass_tracking.cycle_duration', duration);
      this.metrics.gauge('mass_tracking.tweets_found', totalTweetsFound);
      this.metrics.gauge('mass_tracking.tweets_processed', totalTweetsProcessed);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error in mass tracking cycle:', err);
      this.metrics.increment('mass_tracking.cycle_errors');
      this.metrics.timing('mass_tracking.error_duration', duration);
    }
  }

  /**
   * Process a batch of accounts
   */
  private async processAccountBatch(accounts: string[], topic: any, searchStartTime: Date): Promise<[number, number]> {
    let totalTweetsFound = 0;
    let totalTweetsProcessed = 0;

    try {
      // Add rate limiting
      await this.rateLimiter.acquireRateLimit('twitter', 'MASS_TRACKING');
      
      const searchCB = this.circuitBreakers.get('twitter_search')!;
      const timelineCB = this.circuitBreakers.get('twitter_timeline')!;
      
      let tweets: any[] = [];
      
      try {
        // Try batch search first
        tweets = await searchCB.execute(
          async () => {
            return this.twitter.searchTweetsFromUsers(accounts, searchStartTime);
          },
          `search:MASS_TRACKING:batch`
        );
      } catch (searchError) {
        // Fallback to individual timeline searches
        if (searchError instanceof Error && 
            (searchError.message.includes('404') || (searchError as any)?.response?.status === 404)) {
          
          this.logger.warn(`[FALLBACK] Batch search failed with 404, trying individual timeline fallback`);
          
          for (let i = 0; i < accounts.length; i++) {
            const account = accounts[i];
            
            try {
              // Add progressive delay
              if (i > 0) {
                const delay = Math.min(5000, 2000 * i);
                await new Promise(resolve => setTimeout(resolve, delay));
              }
              
              const accountTweets = await timelineCB.execute(
                async () => {
                  return this.twitter.searchTweets(account, searchStartTime, 'from');
                },
                `timeline:MASS_TRACKING:${account}`
              );
              
              tweets.push(...accountTweets);
              
            } catch (accountError) {
              const isRateLimit = accountError instanceof Error &&
                (accountError.message.includes('429') || accountError.message.includes('TOO_MANY_REQUESTS'));
              
              if (isRateLimit) {
                this.logger.warn(`[TIMELINE FALLBACK] Rate limit hit for ${account}, skipping remaining accounts`);
                break;
              } else {
                this.logger.error(`[TIMELINE FALLBACK] Error for account ${account}:`,
                  accountError instanceof Error ? accountError : new Error(String(accountError)));
              }
            }
          }
        } else {
          throw searchError;
        }
      }
      
      totalTweetsFound += tweets.length;
      
      // Process tweets in parallel batches
      const CONCURRENT_PROCESSING_LIMIT = 5;
      const tweetBatches: any[][] = [];
      
      for (let i = 0; i < tweets.length; i += CONCURRENT_PROCESSING_LIMIT) {
        tweetBatches.push(tweets.slice(i, i + CONCURRENT_PROCESSING_LIMIT));
      }
      
      // Process each batch of tweets in parallel
      for (const tweetBatch of tweetBatches) {
        const processingPromises = tweetBatch.map(async (tweet) => {
          try {
            const result = await this.processor.processTweet(tweet, topic);
            if (result) {
              this.logger.info(`[MASS TRACKING] Successfully processed tweet ${tweet.id} from @${tweet.tweetBy?.userName}`);
            }
            return result;
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Error processing tweet ${tweet.id}:`, err);
            return false;
          }
        });
        
        const results = await Promise.all(processingPromises);
        const successCount = results.filter(result => result === true).length;
        const failedCount = results.filter(result => result === false).length;
        totalTweetsProcessed += successCount;
        
        this.logger.info(`[MASS TRACKING] Batch processing results: ${successCount} processed, ${failedCount} filtered out`);
        
        // Small delay between parallel batches
        if (tweetBatches.indexOf(tweetBatch) < tweetBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error processing batch:`, err);
      
      // Handle rate limit errors
      const errorMessage = err.message.toLowerCase();
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        this.rateLimiter.handleRateLimitError('twitter', 'MASS_TRACKING');
      }
    }
    
    return [totalTweetsFound, totalTweetsProcessed];
  }

  /**
   * Stop the mass tracking service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Mass tracking service is not running');
      return;
    }

    this.shutdownRequested = true;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Stop circuit breakers
    this.circuitBreakers.forEach(cb => cb.stop());

    // Close MongoDB connection
    if (this.mongoService) {
      await this.mongoService.close();
    }

    this.isRunning = false;
    this.logger.info('Mass tracking service stopped');
  }
}

async function bootstrap() {
  // Load environment variables
  const dotenvResult = config();
  if (dotenvResult.error) {
    console.error('Failed to load .env file:', dotenvResult.error);
  }

  // Check for quiet mode
  const quietMode = process.env.QUIET_LOGGING === 'true' || process.env.QUIET_LOGGING === '1';
  
  // Initialize container
  const container = createContainer();

  // Set quiet mode if enabled
  if (quietMode) {
    const loggerFactory = LoggerFactory.getInstance();
    loggerFactory.setQuietMode(true);
    console.log('Quiet logging mode enabled for mass tracking service');
  }

  // Get services from container
  const logger = container.get<Logger>(TYPES.Logger);
  const configService = container.get<ConfigService>(TYPES.ConfigService);
  const twitter = container.get<TwitterService>(TYPES.TwitterService);
  const processor = container.get<TweetProcessor>(TYPES.TweetProcessor);
  const storage = container.get<StorageService>(TYPES.StorageService);
  const mongoService = container.get<MongoDBService>(TYPES.MongoDBService);
  const csvLoader = container.get<CsvAccountLoader>(TYPES.CsvAccountLoader);
  const metrics = container.get<EnhancedMetricsManager>(TYPES.EnhancedMetricsManager);
  const rateLimiter = container.get<EnhancedRateLimiter>(TYPES.EnhancedRateLimiter);
  const rettiwtErrorHandler = container.get<RettiwtErrorHandler>(TYPES.RettiwtErrorHandler);

  // Create mass tracking service
  const massTrackingService = new MassTrackingService(
    logger,
    configService,
    twitter,
    processor,
    storage,
    mongoService,
    csvLoader,
    metrics,
    rateLimiter,
    rettiwtErrorHandler
  );

  try {
    logger.info('Starting Mass Tracking Service...');
    
    // Initialize and start the service
    await massTrackingService.initialize();
    await massTrackingService.start();
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down mass tracking service...');
      await massTrackingService.stop();
      process.exit(0);
    });
    
    logger.info('Mass Tracking Service started successfully');
    
  } catch (error) {
    logger.error('Failed to start mass tracking service:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

// Start the service
bootstrap().catch(error => {
  console.error('Unhandled error in mass tracking service bootstrap:', error);
  process.exit(1);
});