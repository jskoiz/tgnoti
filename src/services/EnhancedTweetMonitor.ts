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
    @inject(TYPES.EnhancedRateLimiter) private rateLimiter: EnhancedRateLimiter
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
    const batchSize = this.config.getSystemConfig().tweetBatchSize || 10;
    
    for (const topic of topics) {
      // For topics with mentions (like COMPETITOR_MENTIONS), use the mentions as accounts
      // Otherwise, use the accounts array
      let accounts: string[] = [];
      let accountSource = "accounts";
      
      if (topic.name === 'COMPETITOR_MENTIONS' && topic.mentions && topic.mentions.length > 0) {
        this.logger.info(`Using mentions as accounts for topic ${topic.name} (${topic.id})`);
        accounts = [...topic.mentions];
        accountSource = "mentions";
      } else {
        accounts = [...topic.accounts];
      }
      
      const accountCount = accounts.length;
      const batches: string[][] = [];
      
      while (accounts.length > 0) {
        batches.push(accounts.splice(0, batchSize));
      }
      
      this.accountBatches.set(topic.id, batches);
      this.logger.info(`Created ${batches.length} batches for topic ${topic.name} (${topic.id}) with ${accountCount} ${accountSource}`);
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
      
      this.logger.info(`Search cycle complete: ${totalTweets} tweets found, ${processedTweets} processed in ${duration}ms`);
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
    
    // Process each batch
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      try {
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
      }
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
    
    // Determine search type based on topic name
    const searchType = topic.name === 'COMPETITOR_MENTIONS' ? 'mention' : 'from';
    
    for (const account of accounts) {
      // Check if we're in a global cooldown period before processing each account
      if (this.rettiwtErrorHandler.isInCooldown()) {
        const remainingCooldown = Math.ceil(this.rettiwtErrorHandler.getRemainingCooldown() / 1000);
        this.logger.warn(`[RATE LIMIT PROTECTION] Skipping account ${account} due to global rate limit cooldown (${remainingCooldown}s remaining)`);
        this.metrics.incrementForAccount(account, 'rate_limit_skips', 1);
        
        // Skip to the next account if we're in cooldown
        // We don't need to process any more accounts if we're in cooldown
        continue;
      }
      
      try {
        // Add delay between accounts to respect rate limits
        await this.rateLimiter.acquireRateLimit('twitter', account);
        
        this.logger.info(`Searching tweets for account: ${account}`);
        
        // Use circuit breaker for Twitter API calls
        const twitterCB = this.circuitBreakers.get('twitter_api')!;
        
        const tweets = await twitterCB.execute(
          async () => this.twitter.searchTweets(account, searchStartTime, searchType),
          `search:${account}`
        );
        
        this.logger.info(`Found ${tweets.length} tweets for account ${account}`);
        totalTweetsFound += tweets.length;
        
        this.metrics.gaugeForAccount(account, 'tweets_found', tweets.length);
        
        for (const tweet of tweets) {
          const processed = await this.processor.processTweet(tweet, topic);
          if (processed) {
            totalTweetsProcessed++;
            this.metrics.incrementForAccount(account, 'tweets_processed', 1);
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Error processing account ${account}:`, err);
        this.metrics.increment('monitor.account_errors');
        this.metrics.incrementForAccount(account, 'errors', 1);
        
        // Check if it's a rate limit error
        const errorMessage = err.message.toLowerCase();
        if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
          this.rateLimiter.handleRateLimitError('twitter', account);
        }
        
        // Continue with next account
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