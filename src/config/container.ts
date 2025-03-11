import { Container } from 'inversify';
import { TYPES } from '../types/di.js';
import { TweetFormatter } from '../types/telegram.js';
import { SearchConfig } from './searchConfig.js';
import { Environment } from './environment.js';
import { FileMessageStorage } from '../telegram/storage/messageStorage.js';
import { MessageStorage } from '../telegram/types/messageStorage.js';
import { CircuitBreakerConfig, EnhancedCircuitBreakerConfig } from '../types/monitoring-enhanced.js';
import { Logger } from '../types/logger.js';
import { LogService } from '../logging/LogService.js';
import { EnhancedCircuitBreaker } from '../utils/enhancedCircuitBreaker.js';
import { ConsoleLogger } from '../utils/logger.js';
import { Storage } from '../core/storage/storage.js';
import { ConfigStorage } from '../core/storage/ConfigStorage.js';
import { ConfigManager } from './ConfigManager.js';
import { ConfigService } from '../services/ConfigService.js';
import { MongoDBManager } from '../core/storage/MongoDBManager.js';
import { TwitterService } from '../services/TwitterService.js';
import { MongoDBService } from '../services/MongoDBService.js';
import { StorageService } from '../services/StorageService.js';
import { TwitterClient } from '../core/twitter/twitterClient.js';
import { RettiwtSearchBuilder } from '../core/twitter/rettiwtSearchBuilder.js';
import { SearchStrategy } from '../core/twitter/searchStrategy.js';
import { SearchCacheManager } from '../core/twitter/SearchCacheManager.js';
import { TweetMonitor } from '../services/TweetMonitor.js';
import { MessageProcessor } from '../core/MessageProcessor.js';
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
import { RateLimitedQueue } from '../core/RateLimitedQueue.js';
import { MonitoringDashboard } from '../core/monitoring/MonitoringDashboard.js';
import { DateValidator } from '../utils/dateValidation.js';
import { TweetProcessor } from '../services/TweetProcessor.js';
import { TelegramService } from '../services/TelegramService.js';
import { UsernameHandler } from '../utils/usernameHandler.js';
import { EnhancedTweetMonitor } from '../services/EnhancedTweetMonitor.js';

import TelegramBotApi from 'node-telegram-bot-api';
import { TelegramQueueConfig } from '../types/telegram.js';
import { TelegramConfig } from './telegram.js';
import { TelegramBotService } from '../telegram/bot/telegramBotService.js';
import { LoggingConfig } from './loggingConfig.js';
import { LoggerFactory } from '../logging/LoggerFactory.js';
import { DefaultLogService } from '../logging/DefaultLogService.js';
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
    console.log('Creating LoggerFactory instance with config');
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
  
  // Bind LogService to DefaultLogService
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
  container.bind<MongoDBManager>(TYPES.MongoDBManager).to(MongoDBManager).inSingletonScope();
  container.bind<MessageStorage>(TYPES.MessageStorage).to(FileMessageStorage).inSingletonScope();
  container.bind<ErrorHandler>(TYPES.ErrorHandler).to(ErrorHandler).inSingletonScope();
  container.bind<RettiwtErrorHandler>(TYPES.RettiwtErrorHandler).to(RettiwtErrorHandler).inSingletonScope();
  container.bind<MetricsManager>(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
  container.bind<EnhancedMetricsManager>(TYPES.EnhancedMetricsManager).to(EnhancedMetricsManager).inSingletonScope();
  container.bind<EnhancedRateLimiter>(TYPES.EnhancedRateLimiter).to(EnhancedRateLimiter).inSingletonScope();
  container.bind<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor).to(EnhancedTweetMonitor).inSingletonScope();
  container.bind<MonitoringDashboard>(TYPES.MonitoringDashboard).to(MonitoringDashboard).inSingletonScope();
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
  container.bind<RateLimitedQueue>(TYPES.RateLimitedQueue).to(RateLimitedQueue).inSingletonScope();

  // Twitter Related
  container.bind<TwitterClient>(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
  container.bind<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder).to(RettiwtSearchBuilder).inSingletonScope();
  container.bind<SearchStrategy>(TYPES.SearchStrategy).to(SearchStrategy).inSingletonScope();
  container.bind<SearchCacheManager>(TYPES.SearchCacheManager).to(SearchCacheManager).inSingletonScope();
  container.bind<TweetMonitor>(TYPES.TweetMonitor).to(TweetMonitor).inSingletonScope();
  container.bind<TwitterService>(TYPES.TwitterService).to(TwitterService).inSingletonScope();
  container.bind<TweetProcessor>(TYPES.TweetProcessor).to(TweetProcessor).inSingletonScope();
  container.bind<TelegramService>(TYPES.TelegramService).to(TelegramService).inSingletonScope();
  container.bind<RettiwtKeyManager>(TYPES.RettiwtKeyManager).to(RettiwtKeyManager).inSingletonScope();

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

  // Telegram Queue Configuration
  container.bind<TelegramQueueConfig>(TYPES.TelegramQueueConfig).toDynamicValue(() => ({
    maxQueueSize: 1000,
    maxRetries: 3,
    baseDelayMs: 2000,
    rateLimitWindowMs: 60000, // 1 minute
    maxMessagesPerWindow: 10, // Reduced from 20 to avoid rate limits
    maxDelayMs: 60000, // Maximum delay of 60 seconds
    persistenceEnabled: false
  })).inSingletonScope();

  // Message Processing
  container.bind<MessageProcessor>(TYPES.MessageProcessor).to(MessageProcessor).inSingletonScope();
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

  // Start monitoring
  // Use enhanced monitor if available, otherwise fall back to regular monitor
  try {
    const enhancedMonitor = container.get<EnhancedTweetMonitor>(TYPES.EnhancedTweetMonitor);
    await enhancedMonitor.initialize();
    await enhancedMonitor.start();
  } catch (error) {
    console.warn('Enhanced monitor not available, using regular monitor');
    await container.get<TweetMonitor>(TYPES.TweetMonitor).start();
  }
  
  return container;
}
