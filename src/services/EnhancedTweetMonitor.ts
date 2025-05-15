import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { TopicConfig } from '../config/unified.js';
import { ConfigService } from './ConfigService.js';
import { TwitterService } from './TwitterService.js';
import { TweetProcessor } from './TweetProcessor.js';
import { StorageService } from './StorageService.js';
import { EnhancedMetricsManager } from '../core/monitoring/EnhancedMetricsManager.js';
import { EnhancedCircuitBreaker } from '../utils/enhancedCircuitBreaker.js';
import { EnhancedRateLimiter } from '../utils/enhancedRateLimiter.js';
import { RettiwtErrorHandler } from '../core/twitter/RettiwtErrorHandler.js';
import { AffiliateTrackingService } from './AffiliateTrackingService.js';
import { MonitorState, AccountBatch, HealthStatus, CircuitBreakerState, CircuitBreakerConfig, EnhancedCircuitBreakerConfig } from '../types/monitoring-enhanced.js';
// import { TopicConfig as MonitoringTopicConfig } from '../types/monitoring.js';

@injectable()
export class EnhancedTweetMonitor {
  private isRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastPollTimes: Map<string, Date> = new Map();
  private circuitBreakers: Map<string, EnhancedCircuitBreaker> = new Map();
  private accountBatches: Map<number, string[][]> = new Map();
  private shutdownRequested: boolean = false;
  private version: string = '1.0.0';
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.TwitterService) private twitter: TwitterService,
    @inject(TYPES.TweetProcessor) private processor: TweetProcessor,
    @inject(TYPES.EnhancedMetricsManager) private metrics: EnhancedMetricsManager,
    @inject(TYPES.StorageService) private storage: StorageService,
    @inject(TYPES.RettiwtErrorHandler) private rettiwtErrorHandler: RettiwtErrorHandler,
    @inject(TYPES.EnhancedRateLimiter) private rateLimiter: EnhancedRateLimiter,
    @inject(TYPES.AffiliateTrackingService) private affiliateTrackingService: AffiliateTrackingService
  ) {
    this.logger.setComponent('EnhancedTweetMonitor');
    this.initializeCircuitBreakers();
  }
  
  /**
   * Initialize the monitor
   */
  async initialize(): Promise<void> {
    await this.loadPersistedState();
    this.createAccountBatches();
    this.logger.info('EnhancedTweetMonitor initialized');
  }
  
  /**
   * Load persisted state from storage
   */
  private async loadPersistedState(): Promise<void> {
    try {
      let state: MonitorState | null = null;
      try {
        state = await this.storage.getMonitorState();
      } catch (error) {
        this.logger.warn('Failed to load persisted state, starting fresh');
      }
      
      if (state && state.lastPollTimes) {
        this.lastPollTimes = new Map(Object.entries(state.lastPollTimes).map(
          ([topic, timeStr]) => [topic, new Date(timeStr)]
        ));
        this.logger.info(`Loaded persisted state with ${this.lastPollTimes.size} topic poll times`);
        
        // Restore circuit breaker states if available
        if (state.circuitBreakerStates) {
          Object.entries(state.circuitBreakerStates).forEach(([key, cbState]) => {
            const circuitBreaker = this.circuitBreakers.get(key);
            if (circuitBreaker) {
              circuitBreaker.restoreState(cbState);
              this.logger.debug(`Restored circuit breaker state for ${key}`);
            }
          });
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.warn('Failed to load persisted state, starting fresh', err);
    }
  }
  
  /**
   * Persist monitor state to storage
   */
  private async persistState(): Promise<void> {
    try {
      try {
        const circuitBreakerStates: Record<string, CircuitBreakerState> = {};
        
        // Collect circuit breaker states
        this.circuitBreakers.forEach((cb, key) => {
          circuitBreakerStates[key] = cb.getState();
        });
        
        const state: MonitorState = {
          lastPollTimes: Object.fromEntries(
            Array.from(this.lastPollTimes.entries()).map(
              ([topic, date]) => [topic, date.toISOString()]
            )
          ),
          circuitBreakerStates
        };
        
        await this.storage.saveMonitorState(state);
        this.logger.debug('Persisted monitor state');
      } catch (error) {
        this.logger.warn('Failed to persist state, continuing without persistence');
      }
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to persist state', err);
      this.metrics.increment('monitor.state_persistence_errors');
    }
  }
  
  /**
   * Create batches of accounts for each topic
   */
  private createAccountBatches(): void {
    const topics = this.config.getTopics();
    const systemConfig = this.config.getSystemConfig();
    
    // Get batch size from config, with a configurable maximum for optimal performance
    const maxBatchSize = systemConfig.maxBatchSize || 10; // Default to 10 if not set
    const configuredBatchSize = systemConfig.tweetBatchSize || 50;
    
    // Use the smaller of the configured batch size or the maximum batch size
    // This ensures we don't exceed the recommended limit for reliable results
    const batchSize = Math.min(configuredBatchSize, maxBatchSize);
    
    this.logger.info(`Using batch size of ${batchSize} accounts per query (max configured: ${maxBatchSize})`);

    for (const topic of topics) {
      let accounts: string[] = [];
      let accountSource = "accounts";

      // Simplified logic for determining which accounts to search for
      if (topic.name === 'KOL_MONITORING') {
        // For KOL_MONITORING, we want tweets FROM these accounts
        accounts = [...topic.accounts];
        accountSource = "accounts (KOL users)";
      } else if (topic.name === 'COMPETITOR_MENTIONS' && topic.mentions && topic.mentions.length > 0) {
        // For COMPETITOR_MENTIONS, we want tweets that MENTION these accounts
        accounts = [...topic.mentions];
        accountSource = "mentions (competitors)";
      } else {
        // Default case - use accounts array
        accounts = [...topic.accounts];
      }

      const accountCount = accounts.length;
      const batches: string[][] = [];

      // Create batches of accounts, respecting the batch size limit
      while (accounts.length > 0) {
        batches.push(accounts.splice(0, batchSize));
      }

      this.accountBatches.set(topic.id, batches);
      
      // Enhanced logging for better visibility of batching
      if (batches.length > 1) {
        this.logger.info(`Created ${batches.length} batches for topic ${topic.name} (${topic.id}) with ${accountCount} ${accountSource}`);
        this.logger.debug(`Batch details for ${topic.name}:`, {
          totalAccounts: accountCount,
          batchCount: batches.length,
          batchSize: batchSize,
          accountsInLastBatch: batches[batches.length - 1].length
        });
      } else {
        this.logger.info(`Created 1 batch for topic ${topic.name} (${topic.id}) with ${accountCount} ${accountSource}`);
      }
    }
  }
  
  /**
   * Initialize circuit breakers for different operations
   */
  private initializeCircuitBreakers(): void {
    try {
      // Create circuit breaker for Twitter API
      const twitterCB = new EnhancedCircuitBreaker(this.logger, {
        threshold: 3,
        resetTimeout: 30000,
        testInterval: 5000,
        monitorInterval: 5000
      });
      
      // Set state change callback to persist state
      twitterCB.setStateChangeCallback(() => {
        this.persistState().catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Failed to persist state after circuit breaker state change', err);
        });
      });
      
      this.circuitBreakers.set('twitter_api', twitterCB);
      
      // Create circuit breaker for Telegram API
      const telegramCB = new EnhancedCircuitBreaker(this.logger, {
        threshold: 5,
        resetTimeout: 60000,
        testInterval: 10000,
        monitorInterval: 10000
      });
      
      telegramCB.setStateChangeCallback(() => {
        this.persistState().catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Failed to persist state after circuit breaker state change', err);
        });
      });
      
      this.circuitBreakers.set('telegram_api', telegramCB);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to initialize circuit breakers', err);
    }
  }
  
  /**
   * Start the monitor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Enhanced tweet monitor is already running');
      return;
    }
    
    const twitterConfig = this.config.getTwitterConfig();
    const pollingInterval = twitterConfig.rateLimit.pollingIntervalMs;
    
    this.isRunning = true;
    this.shutdownRequested = false;
    this.logger.info(`Starting enhanced tweet monitor with ${pollingInterval}ms interval`);
    
    // Initial run with a small delay to allow system initialization
    setTimeout(() => {
      if (!this.shutdownRequested) {
        this.run().catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Error in initial monitoring cycle:', err);
        });
      }
    }, 5000);
    
    // Set up interval with adaptive polling
    this.monitoringInterval = setInterval(() => {
      if (this.shutdownRequested) {
        return;
      }
      
      try {
        this.run().catch(error => {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error('Error in monitoring cycle:', err);
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Error in monitoring cycle:', err);
      }
    }, this.calculateDynamicPollingInterval());
  }
  
  /**
   * Run a monitoring cycle
   */
  async run(): Promise<void> {
    const startTime = Date.now();
    this.metrics.increment('monitor.cycles');
    
    try {
      const topics = this.config.getTopics();
      let totalTweets = 0;
      let processedTweets = 0;
      
      // Process each topic
      for (const topic of topics) {
        // Check if we're in a global cooldown period from RettiwtErrorHandler
        if (this.rettiwtErrorHandler.isInCooldown()) {
          const remainingCooldown = Math.ceil(this.rettiwtErrorHandler.getRemainingCooldown() / 1000);
          this.logger.warn(`[RATE LIMIT PROTECTION] Skipping topic ${topic.name} (ID: ${topic.id}) due to global rate limit cooldown (${remainingCooldown}s remaining)`);
          this.metrics.incrementForTopic(`${topic.id}`, 'rate_limit_skips', 1);
          
          // If we're in cooldown, pause processing for a short time before checking the next topic
          // This prevents rapid checking of all topics when we know we're in cooldown
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          continue;
        }
        
        try {
          // Add delay between topics to respect rate limits
          await this.rateLimiter.acquireRateLimit('topic', `${topic.id}`);
          
          const topicStartTime = Date.now();
          this.logger.info(`Processing topic ${topic.name} (ID: ${topic.id})`);
          
          const [tweetsFound, tweetsProcessed] = await this.processTopic(topic);
          totalTweets += tweetsFound;
          processedTweets += tweetsProcessed;
          
          const topicDuration = Date.now() - topicStartTime;
          this.metrics.timingForTopic(`${topic.id}`, 'processing_duration', topicDuration);
          this.metrics.gaugeForTopic(`${topic.id}`, 'tweets_found', tweetsFound);
          this.metrics.gaugeForTopic(`${topic.id}`, 'tweets_processed', tweetsProcessed);
          
          this.logger.info(`Topic ${topic.name} processed: ${tweetsFound} tweets found, ${tweetsProcessed} processed in ${topicDuration}ms`);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.logger.error(`Error processing topic ${topic.name} (${topic.id}):`, err);
          this.metrics.incrementForTopic(`${topic.id}`, 'errors', 1);
        }
      }
      
      // Persist metrics and state
      await this.metrics.persistMetrics();
      await this.persistState();
      
      const duration = Date.now() - startTime;
      
      // Check for affiliate changes during each monitoring cycle
      try {
        this.logger.info('Checking for affiliate changes...');
        await this.checkAffiliateChanges();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Error checking affiliate changes:', err);
        this.metrics.increment('affiliates.check_errors');
      }

      // Add [CYCLE COMPLETE] marker for enhanced visibility in logs
      this.logger.info(`[CYCLE COMPLETE] Search cycle finished: ${totalTweets} tweets found, ${processedTweets} processed in ${duration}ms`, { status: 'CYCLE_COMPLETE' });
      this.metrics.timing('monitor.cycle_duration', duration);
      this.metrics.gauge('monitor.tweets_found', totalTweets);
      this.metrics.gauge('monitor.tweets_processed', processedTweets);
    } catch (error) {
      const duration = Date.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error in monitoring run:', err);
      this.metrics.increment('monitor.cycle_errors');
      this.metrics.timing('monitor.error_duration', duration);
    }
  }
  
  /**
   * Process a topic
   * @param topic Topic configuration
   * @returns [tweetsFound, tweetsProcessed]
   */
  private async processTopic(topic: any): Promise<[number, number]> {
    // Calculate search window
    let searchStartTime: Date;
    const topicKey = `${topic.id}`;
    
    if (this.lastPollTimes.has(topicKey)) {
      const twitterConfig = this.config.getTwitterConfig();
      const overlapMs = twitterConfig.searchWindow.overlapBufferMinutes * 60 * 1000;
      searchStartTime = new Date(this.lastPollTimes.get(topicKey)!.getTime() - overlapMs);
    } else {
      const defaultWindowMinutes = topic.searchWindowMinutes ||
        this.config.getTwitterConfig().searchWindow.windowMinutes;
      searchStartTime = new Date(Date.now() - (defaultWindowMinutes * 60 * 1000));
    }
    
    const searchEndTime = new Date();
    this.lastPollTimes.set(topicKey, searchEndTime);
    
    this.logger.info(`Topic ${topic.name} search window: ${searchStartTime.toISOString()} to ${searchEndTime.toISOString()}`);
    
    let totalTweetsFound = 0;
    let totalTweetsProcessed = 0;
    
    // Get batches for this topic
    const batches = this.accountBatches.get(topic.id) || [];
    if (batches.length === 0) {
      this.logger.warn(`No account batches found for topic ${topic.name} (${topic.id})`);
      return [0, 0];
    }
    
    // Log batch information for KOL_MONITORING to highlight the automatic batching
    if (topic.name === 'KOL_MONITORING' && batches.length > 1) {
      this.logger.info(`KOL_MONITORING accounts automatically split into ${batches.length} batches for optimal performance`);
    }
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
        // Add delay between batches to respect rate limits, but only if not the first batch
        if (batchIndex > 0) {
          const twitterConfig = this.config.getTwitterConfig();
          const batchDelayMs = Math.max(2000, Math.min(twitterConfig.rateLimit.topicDelayMs / 2, 5000));
          this.logger.debug(`Adding ${batchDelayMs}ms delay between batches for topic ${topic.name}`);
          await new Promise(resolve => setTimeout(resolve, batchDelayMs));
        }
        
        this.logger.info(`Processing batch ${batchIndex + 1}/${batches.length} for topic ${topic.name} (${batch.length} accounts)`);
        
        const [tweetsFound, tweetsProcessed] = await this.processAccountBatch(batch, topic, searchStartTime);
        totalTweetsFound += tweetsFound;
        totalTweetsProcessed += tweetsProcessed;
        
        this.metrics.gaugeForTopic(`${topic.id}`, `batch_${batchIndex}_tweets_found`, tweetsFound);
        this.metrics.gaugeForTopic(`${topic.id}`, `batch_${batchIndex}_tweets_processed`, tweetsProcessed);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Error processing batch ${batchIndex + 1}/${batches.length} for topic ${topic.name}:`, err);
        this.metrics.incrementForTopic(`${topic.id}`, 'batch_errors', 1);
        
        // If we encounter an error with a batch, add a longer delay before the next batch
        // to help avoid cascading failures
        if (batchIndex < batches.length - 1) {
          const errorDelayMs = 10000; // 10 seconds
          this.logger.info(`Adding ${errorDelayMs}ms delay after batch error before processing next batch`);
          await new Promise(resolve => setTimeout(resolve, errorDelayMs));
        }
      }
    }
    
    // Log summary for multi-batch processing
    if (batches.length > 1) {
      this.logger.info(`Completed processing ${batches.length} batches for topic ${topic.name}: ${totalTweetsFound} tweets found, ${totalTweetsProcessed} processed`);
    }
    
    return [totalTweetsFound, totalTweetsProcessed];
  }
  
  /**
   * Process a batch of accounts
   * @param accounts List of accounts to process
   * @param topic Topic configuration
   * @param searchStartTime Start time for search window
   * @returns [tweetsFound, tweetsProcessed]
   */
  private async processAccountBatch(accounts: string[], topic: any, searchStartTime: Date): Promise<[number, number]> {
    let totalTweetsFound = 0;
    let totalTweetsProcessed = 0;

    // Determine search type based on topic
    let searchType: 'from' | 'mention';
    if (topic.name === 'KOL_MONITORING') {
      // For KOL_MONITORING, we explicitly want tweets FROM these accounts
      searchType = 'from';
      this.logger.info(`[SRCH] KOL_MONITORING: Searching for tweets FROM accounts: ${accounts.join(', ')}`);
      
      // Add extra logging for KOL_MONITORING to help debug the issue
      this.logger.debug(`KOL_MONITORING search details:`, {
        topicId: topic.id,
        accountCount: accounts.length,
        searchWindow: `${searchStartTime.toISOString()} to ${new Date().toISOString()}`,
        searchType: 'from'
      });
    } else if (topic.name === 'COMPETITOR_MENTIONS') {
      // For COMPETITOR_MENTIONS, we want tweets that MENTION these accounts
      searchType = 'mention';
      this.logger.info(`[SRCH] COMPETITOR_MENTIONS: Searching for tweets MENTIONING accounts: ${accounts.join(', ')}`);
    } else {
      // Default behavior based on topic configuration
      searchType = topic.mentions && topic.mentions.length > 0 ? 'mention' : 'from';
      this.logger.info(`[SRCH] Topic ${topic.name}: Searching for tweets ${searchType === 'from' ? 'FROM' : 'MENTIONING'} accounts: ${accounts.join(', ')}`);
    }

    // Check for rate limit cooldown
    if (this.rettiwtErrorHandler.isInCooldown()) {
      const remainingCooldown = Math.ceil(this.rettiwtErrorHandler.getRemainingCooldown() / 1000);
      this.logger.warn(`[RATE LIMIT PROTECTION] Skipping batch for topic ${topic.name} due to global rate limit cooldown (${remainingCooldown}s remaining)`);
      return [0, 0];
    }

    try {
      // Add delay for rate limiting
      await this.rateLimiter.acquireRateLimit('twitter', topic.name);
      
      this.logger.info(`Searching tweets for ${accounts.length} accounts in batch: ${accounts.join(', ')}`);
      
      // Use circuit breaker for Twitter API calls
      const twitterCB = this.circuitBreakers.get('twitter_api')!;
      
      let tweets: any[] = [];
      
      try {
        // OPTIMIZED: Use a single search for all accounts in the batch
        tweets = await twitterCB.execute(
          async () => {
            // Create a combined search for all accounts
            if (searchType === 'from') {
              return this.twitter.searchTweetsFromUsers(accounts, searchStartTime);
            } else {
              return this.twitter.searchTweetsMentioningUsers(accounts, searchStartTime);
            }
          },
          `search:${topic.name}:batch`
        );
      } catch (searchError) {
        // If batch search fails with 404, fall back to individual account searches
        if (searchError instanceof Error &&
            (searchError.message.includes('404') ||
             (searchError as any)?.response?.status === 404)) {
          
          this.logger.warn(`[FALLBACK] Batch search failed with 404 for topic ${topic.name}, trying individual account searches`);
          
          // Process each account individually
          for (const account of accounts) {
            try {
              this.logger.info(`[FALLBACK] Searching tweets for individual account: ${account}`);
              
              // Use the appropriate search method based on search type
              const accountTweets = await twitterCB.execute(
                async () => {
                  if (searchType === 'from') {
                    return this.twitter.searchTweets(account, searchStartTime, 'from');
                  } else {
                    return this.twitter.searchTweets(account, searchStartTime, 'mention');
                  }
                },
                `search:${topic.name}:individual`
              );
              
              tweets.push(...accountTweets);
              this.logger.info(`[FALLBACK] Found ${accountTweets.length} tweets for account ${account}`);
              
              // Add a small delay between individual searches to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (accountError) {
              this.logger.error(`[FALLBACK] Error searching tweets for account ${account}:`,
                accountError instanceof Error ? accountError : new Error(String(accountError)));
            }
          }
          
          this.logger.info(`[FALLBACK] Individual searches found a total of ${tweets.length} tweets for ${accounts.length} accounts`);
        } else {
          // For other errors, rethrow
          throw searchError;
        }
      }
      
      this.logger.info(`Found ${tweets.length} tweets for batch of ${accounts.length} accounts`);
      totalTweetsFound += tweets.length;
      
      // Process tweets
      for (const tweet of tweets) {
        const processed = await this.processor.processTweet(tweet, topic);
        if (processed) {
          totalTweetsProcessed++;
        }
      }
      
      // Update metrics for each account in the batch
      for (const account of accounts) {
        this.metrics.gaugeForAccount(account, 'tweets_found', tweets.length / accounts.length); // Approximate
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error processing batch for topic ${topic.name}:`, err);
      this.metrics.increment('monitor.batch_errors');
      
      // Check if it's a rate limit error
      const errorMessage = err.message.toLowerCase();
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        this.rateLimiter.handleRateLimitError('twitter', topic.name);
      }
    }
    
    return [totalTweetsFound, totalTweetsProcessed];
  }
  
  /**
   * Calculate dynamic polling interval based on tweet volume and error rates
   */
  private calculateDynamicPollingInterval(): number {
    const twitterConfig = this.config.getTwitterConfig();
    const baseInterval = twitterConfig.rateLimit.pollingIntervalMs;
    
    // Get error rate from metrics
    const cycleCount = this.metrics.getValue('monitor.cycles') || 1;
    const errorCount = this.metrics.getValue('monitor.cycle_errors') || 0;
    const errorRate = errorCount / cycleCount;
    
    // Get tweet volume from metrics
    const tweetsFound = this.metrics.getValue('monitor.tweets_found') || 0;
    const avgTweetsPerCycle = tweetsFound / cycleCount;
    
    // Adjust interval based on error rate and tweet volume
    let adjustedInterval = baseInterval;
    
    // If error rate is high, increase interval
    if (errorRate > 0.1) { // More than 10% errors
      adjustedInterval = Math.min(baseInterval * 2, 10 * 60 * 1000); // Max 10 minutes
    }
    
    // If tweet volume is high, decrease interval
    if (avgTweetsPerCycle > 100) {
      adjustedInterval = Math.max(baseInterval / 2, 60 * 1000); // Min 1 minute
    }
    
    // If tweet volume is low, increase interval
    if (avgTweetsPerCycle < 10) {
      adjustedInterval = Math.min(baseInterval * 1.5, 5 * 60 * 1000); // Max 5 minutes
    }
    
    // Log if interval changed
    if (adjustedInterval !== baseInterval) {
      this.logger.info(`Adjusted polling interval from ${baseInterval}ms to ${adjustedInterval}ms based on error rate (${(errorRate * 100).toFixed(1)}%) and tweet volume (${avgTweetsPerCycle.toFixed(1)} tweets/cycle)`);
    }
    
    return adjustedInterval;
  }
  
  /**
   * Check for affiliate changes
   */
  private async checkAffiliateChanges(): Promise<void> {
    try {
      // Use the AffiliateTrackingService to check for changes
      await this.affiliateTrackingService.checkAndReportAffiliateChanges();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Error checking affiliate changes:', err);
      this.metrics.increment('affiliates.check_errors');
      throw error;
    }
  }
  
  /**
   * Get health status of the monitor
   */
  async healthCheck(): Promise<HealthStatus> {
    const circuitBreakerStatus: Record<string, {
      isOpen: boolean;
      failures: number;
      halfOpen: boolean;
    }> = {};
    
    // Collect circuit breaker status
    this.circuitBreakers.forEach((cb, key) => {
      circuitBreakerStatus[key] = cb.getStatus();
    });
    
    // Collect key metrics
    const keyMetrics: Record<string, number> = {
      cycles: this.metrics.getValue('monitor.cycles'),
      errors: this.metrics.getValue('monitor.cycle_errors'),
      tweets_found: this.metrics.getValue('monitor.tweets_found'),
      tweets_processed: this.metrics.getValue('monitor.tweets_processed'),
      account_errors: this.metrics.getValue('monitor.account_errors'),
      cycle_duration: this.metrics.getValue('monitor.cycle_duration')
    };
    
    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    // Check if any circuit breaker is open
    const anyCircuitOpen = Object.values(circuitBreakerStatus).some(cb => cb.isOpen);
    if (anyCircuitOpen) {
      status = 'degraded';
    }
    
    // Check error rate
    const errorRate = keyMetrics.errors / Math.max(keyMetrics.cycles, 1);
    if (errorRate > 0.25) { // More than 25% errors
      status = 'unhealthy';
    } else if (errorRate > 0.1) { // More than 10% errors
      status = 'degraded';
    }
    
    return {
      status,
      timestamp: Date.now(),
      metrics: keyMetrics,
      circuitBreakers: circuitBreakerStatus,
      lastPollTimes: Object.fromEntries(
        Array.from(this.lastPollTimes.entries()).map(
          ([topic, date]) => [topic, date.toISOString()]
        )
      ),
      version: this.version
    };
  }
  
  /**
   * Stop the monitor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Enhanced tweet monitor is not running');
      return;
    }
    
    this.shutdownRequested = true;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    // Persist state before stopping
    await this.persistState();
    
    // Stop circuit breakers
    this.circuitBreakers.forEach(cb => cb.stop());
    
    this.isRunning = false;
    this.logger.info('Enhanced tweet monitor stopped');
  }
}