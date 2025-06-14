import { Container } from 'inversify';
import { TYPES } from '../types/di.js';
import { TweetFormatter } from '../types/telegram.js';
import { SearchConfig } from './searchConfig.js';
import { Environment } from './environment.js';
import { FileMessageStorage } from '../telegram/storage/messageStorage.js';
import { MessageStorage } from '../telegram/types/messageStorage.js';
import { EnhancedCircuitBreakerConfig } from '../types/monitoring-enhanced.js';
import { Logger } from '../types/logger.js';
import { LogService } from '../logging/LogService.js';
import { EnhancedCircuitBreaker } from '../utils/enhancedCircuitBreaker.js';
import { Storage } from '../core/storage/storage.js';
import { ConfigStorage } from '../core/storage/ConfigStorage.js';
import { ConfigManager } from './ConfigManager.js';
import { ConfigService } from '../services/ConfigService.js';
import { TwitterService } from '../services/TwitterService.js';
import { MongoDBService } from '../services/MongoDBService.js';
import { StorageService } from '../services/StorageService.js';
import { TwitterAffiliateService } from '../services/TwitterAffiliateService.js';
import { AffiliateTrackingService } from '../services/AffiliateTrackingService.js';
import { TwitterClient } from '../core/twitter/twitterClient.js';
import { RettiwtSearchBuilder } from '../core/twitter/rettiwtSearchBuilder.js';
import { SearchStrategy } from '../core/twitter/searchStrategy.js';
import { SearchCacheManager } from '../core/twitter/SearchCacheManager.js';
import { TelegramBot } from '../telegram/bot/telegramBot.js';
import { TopicManager } from '../telegram/bot/TopicManager.js';
import { TopicFilterManager } from '../telegram/bot/TopicFilterManager.js';
import { FilterCommandHandler } from '../telegram/bot/FilterCommandHandler.js';
import { RettiwtKeyManager } from '../core/twitter/rettiwtKeyManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { RettiwtErrorHandler } from '../core/twitter/RettiwtErrorHandler.js';
import { MessageValidator } from '../utils/messageValidator.js';
import { EnhancedMessageFormatter } from '../telegram/bot/messageFormatter.js';
import { TelegramMessageQueue } from '../telegram/queue/TelegramMessageQueue.js';
import { TelegramMessageSender } from '../telegram/queue/TelegramMessageSender.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { EnhancedMetricsManager } from '../core/monitoring/EnhancedMetricsManager.js';
import { EnhancedRateLimiter } from '../utils/enhancedRateLimiter.js';
// RateLimitedQueue has been replaced by EnhancedRateLimiter
import { DateValidator } from '../utils/dateValidation.js';
import { TweetProcessor } from '../services/TweetProcessor.js';
import { TelegramService } from '../services/TelegramService.js';
import { UsernameHandler } from '../utils/usernameHandler.js';
import { EnhancedTweetMonitor } from '../services/EnhancedTweetMonitor.js';
import { CsvAccountLoader } from '../services/CsvAccountLoader.js';
import { DiscordWebhookService, DiscordWebhookConfig } from '../services/DiscordWebhookService.js';
import { DeliveryManager } from '../services/DeliveryManager.js';

import TelegramBotApi from 'node-telegram-bot-api';
import { TelegramQueueConfig } from '../types/telegram.js';
import { TelegramConfig } from './telegram.js';
import { TelegramBotService } from '../telegram/bot/telegramBotService.js';
import { LoggingConfig } from './loggingConfig.js';
import { LoggerFactory } from '../logging/LoggerFactory.js';
import { MongoDataValidator } from '../utils/mongoDataValidator.js';

// Declare global container for DI
declare global { 
  var container: Container | undefined; 
}

export function createContainer(): Container {
  const container = new Container();
  
  // Make container globally available to avoid circular dependencies
  global.container = container;

  // Set default scope to singleton
  container.options.defaultScope = "Singleton";

  // System
  container.bind<string>(TYPES.BasePath).toConstantValue(process.cwd());
  
  // Logging Configuration
  container.bind<LoggingConfig>(TYPES.LoggingConfig).to(LoggingConfig).inSingletonScope();
  
  // Configure LoggerFactory with LoggingConfig
  container.bind<LoggerFactory>(TYPES.LoggerFactory).toDynamicValue((context) => {
    const loggingConfig = context.container.get<LoggingConfig>(TYPES.LoggingConfig);
    const factory = LoggerFactory.getInstance();
    factory.configure(loggingConfig.getFullConfig());
    return factory;
  }).inSingletonScope();
  
  // Logger - Create a new instance for each component
  container.bind<Logger>(TYPES.Logger).toDynamicValue((context) => {
    const factory = context.container.get<LoggerFactory>(TYPES.LoggerFactory);
    // Get the requesting component's name from the container
    const componentName = context.currentRequest?.parentRequest?.serviceIdentifier?.toString() || 'default';
    // Create a new logger instance for this component
    const logger = factory.createLogger(componentName);
    return logger;
  });
  
  // Bind LogService to Logger
  container.bind<LogService>(TYPES.LogService).toDynamicValue((context) => {
    return context.container.get<Logger>(TYPES.Logger);
  });

  // Core Services
  container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManager).inSingletonScope();
  container.bind<ConfigService>(TYPES.ConfigService).to(ConfigService).inSingletonScope();
  container.bind<MongoDBService>(TYPES.MongoDBService).to(MongoDBService).inSingletonScope();
  container.bind<StorageService>(TYPES.StorageService).to(StorageService).inSingletonScope();
  
  // Initialize ConfigManager first
  const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
  configManager.initialize();
  
  container.bind<Environment>(TYPES.Environment).to(Environment).inSingletonScope();  
  container.bind<SearchConfig>(TYPES.SearchConfig).to(SearchConfig).inSingletonScope();
  container.bind<Storage>(TYPES.Storage).to(Storage).inSingletonScope();
  container.bind<ConfigStorage>(TYPES.ConfigStorage).to(ConfigStorage).inSingletonScope();
  // DatabaseManager is removed as we're using MongoDB exclusively
  container.bind<MessageStorage>(TYPES.MessageStorage).to(FileMessageStorage).inSingletonScope();
  container.bind<ErrorHandler>(TYPES.ErrorHandler).to(ErrorHandler).inSingletonScope();
  container.bind<RettiwtErrorHandler>(TYPES.RettiwtErrorHandler).to(RettiwtErrorHandler).inSingletonScope();
  container.bind<MetricsManager>(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
  container.bind<EnhancedMetricsManager>(TYPES.EnhancedMetricsManager).to(EnhancedMetricsManager).inSingletonScope();
  container.bind<EnhancedRateLimiter>(TYPES.EnhancedRateLimiter).to(EnhancedRateLimiter).inSingletonScope();
  container.bind<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor).to(EnhancedTweetMonitor).inSingletonScope();
  container.bind<MongoDataValidator>(TYPES.MongoDataValidator).to(MongoDataValidator).inSingletonScope();
  
  // Enhanced circuit breaker config
  container.bind<EnhancedCircuitBreakerConfig>(TYPES.CircuitBreakerConfig).toConstantValue({
    threshold: 5,
    resetTimeout: 30000, // 30 seconds
    testInterval: 5000,   // 5 seconds
    monitorInterval: 5000 // 5 seconds
  });
  
  // Create and bind EnhancedCircuitBreaker instance
  const circuitBreakerConfig = {
    threshold: 5,
    resetTimeout: 30000, // 30 seconds
    testInterval: 5000,   // 5 seconds
    monitorInterval: 5000 // 5 seconds
  };
  
  // Create a factory for EnhancedCircuitBreaker
  container.bind(TYPES.CircuitBreaker).toDynamicValue((context) => {
    const logger = context.container.get<Logger>(TYPES.Logger);
    return new EnhancedCircuitBreaker(logger, circuitBreakerConfig);
  }).inSingletonScope();
  
  container.bind<UsernameHandler>(TYPES.UsernameHandler).to(UsernameHandler).inSingletonScope();
  // RateLimitedQueue binding removed as it's been replaced by EnhancedRateLimiter

  // Twitter Related
  container.bind<TwitterClient>(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
  container.bind<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder).to(RettiwtSearchBuilder).inSingletonScope();
  container.bind<SearchStrategy>(TYPES.SearchStrategy).to(SearchStrategy).inSingletonScope();
  container.bind<SearchCacheManager>(TYPES.SearchCacheManager).to(SearchCacheManager).inSingletonScope();
  container.bind<TwitterService>(TYPES.TwitterService).to(TwitterService).inSingletonScope();
  container.bind<TweetProcessor>(TYPES.TweetProcessor).to(TweetProcessor).inSingletonScope();
  container.bind<TelegramService>(TYPES.TelegramService).to(TelegramService).inSingletonScope();
  container.bind<RettiwtKeyManager>(TYPES.RettiwtKeyManager).to(RettiwtKeyManager).inSingletonScope();
  container.bind<TwitterAffiliateService>(TYPES.TwitterAffiliateService).to(TwitterAffiliateService).inSingletonScope();
  container.bind<AffiliateTrackingService>(TYPES.AffiliateTrackingService).to(AffiliateTrackingService).inSingletonScope();
  container.bind<CsvAccountLoader>(TYPES.CsvAccountLoader).to(CsvAccountLoader).inSingletonScope();

  // Discord Webhook Configuration
  container.bind<DiscordWebhookConfig>('DiscordWebhookConfig').toDynamicValue(() => ({
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1383246051028369540/FLhcbwkg8kj983KG-QatoG50Vee183btMA15hlIpRz_NZEU9C15t_HEkGO534GTKc_7W',
    enabled: process.env.DISCORD_WEBHOOK_ENABLED !== 'false', // Default enabled unless explicitly disabled
    rateLimitPerMinute: parseInt(process.env.DISCORD_RATE_LIMIT_PER_MINUTE || '30', 10), // Discord allows 30 messages per minute per webhook
    maxRetries: parseInt(process.env.DISCORD_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.DISCORD_RETRY_DELAY_MS || '1000', 10)
  })).inSingletonScope();

  // Discord Webhook Service
  container.bind<DiscordWebhookService>(TYPES.DiscordWebhookService).toDynamicValue((context) => {
    const logger = context.container.get<Logger>(TYPES.Logger);
    const metrics = context.container.get<MetricsManager>(TYPES.MetricsManager);
    const config = context.container.get<DiscordWebhookConfig>('DiscordWebhookConfig');
    return new DiscordWebhookService(logger, metrics, config);
  }).inSingletonScope();

  // Delivery Manager
  container.bind<DeliveryManager>(TYPES.DeliveryManager).to(DeliveryManager).inSingletonScope();

  // Telegram Related
  container.bind<TelegramBotService>(TYPES.TelegramBotService).to(TelegramBotService).inSingletonScope();
  container.bind<TelegramBot>(TYPES.TelegramBot).to(TelegramBot).inSingletonScope();
  container.bind<TelegramMessageQueue>(TYPES.TelegramMessageQueue).to(TelegramMessageQueue).inSingletonScope();
  container.bind<TelegramMessageSender>(TYPES.TelegramMessageSender).to(TelegramMessageSender).inSingletonScope();
  container.bind<TelegramBotApi>('TelegramBotApi').toDynamicValue((context) => 
    context.container.get<TelegramBotService>(TYPES.TelegramBotService).getBot()
  ).inSingletonScope();
  
  // Telegram Config from Environment
  container.bind<TelegramConfig>(TYPES.TelegramConfig).toDynamicValue((context) => {
    return context.container.get<Environment>(TYPES.Environment).getConfig().telegram;
  }).inSingletonScope();

  // Telegram Queue Configuration - Conservative settings to avoid rate limits
  container.bind<TelegramQueueConfig>(TYPES.TelegramQueueConfig).toDynamicValue(() => ({
    maxQueueSize: 1000,
    maxRetries: 5, // Increased retries for rate limit scenarios
    baseDelayMs: 3000, // Increased base delay to 3 seconds between messages
    rateLimitWindowMs: 60000, // 1 minute window
    maxMessagesPerWindow: 8, // Very conservative - 8 messages per minute max
    maxDelayMs: 120000, // Maximum delay of 2 minutes for severe rate limiting
    persistenceEnabled: false
  })).inSingletonScope();

  // Message Processing
  container.bind<MessageValidator>(TYPES.MessageValidator).to(MessageValidator).inSingletonScope();
  container.bind<TweetFormatter>(TYPES.TweetFormatter).to(EnhancedMessageFormatter).inSingletonScope();

  // Topic Management
  container.bind<TopicManager>(TYPES.TopicManager).to(TopicManager).inSingletonScope();
  container.bind<TopicFilterManager>(TYPES.TopicFilterManager).to(TopicFilterManager).inSingletonScope();
  container.bind<FilterCommandHandler>(TYPES.FilterCommandHandler).to(FilterCommandHandler).inSingletonScope();

  // Validation
  container.bind<DateValidator>(TYPES.DateValidator).to(DateValidator).inSingletonScope();

  // Initialize DateValidator with SearchConfig to break circular dependency
  const dateValidator = container.get<DateValidator>(TYPES.DateValidator);
  const searchConfig = container.get<SearchConfig>(TYPES.SearchConfig);
  dateValidator.setSearchConfig(searchConfig);
  
  return container;
}

export async function initializeContainer(): Promise<Container> {
  const container = createContainer();
  
  // Initialize database
  try {
    await container.get<StorageService>(TYPES.StorageService).initialize();
    
    // Initialize ConfigService after StorageService
    await container.get<ConfigService>(TYPES.ConfigService).initialize();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Failed to initialize databases:', err.message);
    if (err.stack) {
      console.error(err.stack);
    }
    console.warn('Continuing in fallback mode without full database support. Some features may be limited.');
  }

  // Initialize services
  const telegramService = container.get<TelegramService>(TYPES.TelegramService);
  await telegramService.initialize();
  
  // Initialize TelegramBot
  const telegramBot = container.get<TelegramBot>(TYPES.TelegramBot);
  await telegramBot.initialize();

  // Start monitoring with EnhancedTweetMonitor
  const enhancedMonitor = container.get<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor);
  await enhancedMonitor.initialize();
  await enhancedMonitor.start();
  
  // Initialize AffiliateTrackingService
  const affiliateTrackingService = container.get<AffiliateTrackingService>(TYPES.AffiliateTrackingService);
  await affiliateTrackingService.initialize();
  
  return container;
}
