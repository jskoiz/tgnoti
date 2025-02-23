import { Container } from 'inversify';
import { TYPES } from '../types/di.js';
import { TweetFormatter } from '../types/telegram.js';
import { SearchConfig } from './searchConfig.js';
import { Environment } from './environment.js';
import { FileMessageStorage } from '../storage/messageStorage.js';
import { MessageStorage } from '../types/messageStorage.js';
import { CircuitBreakerConfig } from '../types/monitoring.js';
import { Logger } from '../types/logger.js';
import { Storage } from '../storage/storage.js';
import { DatabaseManager } from '../storage/DatabaseManager.js';
import { ConfigManager } from './ConfigManager.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { RettiwtSearchBuilder } from '../twitter/rettiwtSearchBuilder.js';
import { SearchStrategy } from '../twitter/searchStrategy.js';
import { SearchCacheManager } from '../twitter/SearchCacheManager.js';
import { TweetProcessor } from '../core/TweetProcessor.js';
import { TweetMonitor } from '../core/TweetMonitor.js';
import { MessageProcessor } from '../core/MessageProcessor.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { TopicManager } from '../bot/TopicManager.js';
import { TopicFilterManager } from '../bot/TopicFilterManager.js';
import { RettiwtKeyManager } from '../twitter/rettiwtKeyManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { MessageValidator } from '../utils/messageValidator.js';
import { EnhancedMessageFormatter } from '../bot/messageFormatter.js';
import { TelegramMessageQueue } from '../telegram/TelegramMessageQueue.js';
import { TelegramMessageSender } from '../telegram/TelegramMessageSender.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { RateLimitedQueue } from '../core/RateLimitedQueue.js';
import { FilterPipeline } from '../core/FilterPipeline.js';
import { TwitterNotifier } from '../core/TwitterNotifier.js';
import { DateValidator } from '../utils/dateValidation.js';
import TelegramBotApi from 'node-telegram-bot-api';
import { TelegramQueueConfig } from '../types/telegram.js';
import path from 'path';

export function createContainer(): Container {
  const container = new Container();

  // System
  container.bind<string>(TYPES.BasePath).toConstantValue(process.cwd());
  container.bind<Logger>(TYPES.Logger).toConstantValue(console);

  // Core Services
  container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManager).inSingletonScope();
  container.bind<Environment>(TYPES.Environment).to(Environment).inSingletonScope();
  container.bind<SearchConfig>(TYPES.SearchConfig).to(SearchConfig).inSingletonScope();
  container.bind<Storage>(TYPES.Storage).to(Storage).inSingletonScope();
  container.bind<DatabaseManager>(TYPES.DatabaseManager).to(DatabaseManager).inSingletonScope();
  container.bind<MessageStorage>(TYPES.MessageStorage).to(FileMessageStorage).inSingletonScope();
  container.bind<CircuitBreakerConfig>(TYPES.CircuitBreakerConfig).toConstantValue({
    threshold: 5,
    resetTimeout: 30000, // 30 seconds
    testInterval: 5000   // 5 seconds
  });
  container.bind<ErrorHandler>(TYPES.ErrorHandler).to(ErrorHandler).inSingletonScope();
  container.bind<CircuitBreaker>(TYPES.CircuitBreaker).to(CircuitBreaker).inSingletonScope();
  container.bind<MetricsManager>(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
  container.bind<RateLimitedQueue>(TYPES.RateLimitedQueue).to(RateLimitedQueue).inSingletonScope();

  // Twitter Related
  container.bind<TwitterClient>(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
  container.bind<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder).to(RettiwtSearchBuilder).inSingletonScope();
  container.bind<SearchStrategy>(TYPES.SearchStrategy).to(SearchStrategy).inSingletonScope();
  container.bind<SearchCacheManager>(TYPES.SearchCacheManager).to(SearchCacheManager).inSingletonScope();
  container.bind<TweetProcessor>(TYPES.TweetProcessor).to(TweetProcessor).inSingletonScope();
  container.bind<TweetMonitor>(TYPES.TweetMonitor).to(TweetMonitor).inSingletonScope();
  container.bind<TwitterNotifier>(TYPES.TwitterNotifier).to(TwitterNotifier).inSingletonScope();
  container.bind<RettiwtKeyManager>(TYPES.RettiwtKeyManager).to(RettiwtKeyManager).inSingletonScope();

  // Telegram Related
  container.bind<TelegramBot>(TYPES.TelegramBot).to(TelegramBot).inSingletonScope();
  container.bind<TelegramMessageQueue>(TYPES.TelegramMessageQueue).to(TelegramMessageQueue).inSingletonScope();
  container.bind<TelegramMessageSender>(TYPES.TelegramMessageSender).to(TelegramMessageSender).inSingletonScope();
  container.bind<TelegramBotApi>('TelegramBotApi').toDynamicValue((context) => {
    const configManager = context.container.get<ConfigManager>(TYPES.ConfigManager);
    const environment = configManager.getEnvConfig<string>('TELEGRAM_BOT_TOKEN');
    return new TelegramBotApi(environment, { polling: false });
  }).inSingletonScope();


  // Telegram Queue Configuration
  container.bind<TelegramQueueConfig>(TYPES.TelegramQueueConfig).toDynamicValue(() => ({
    maxQueueSize: 1000,
    maxRetries: 3,
    baseDelayMs: 1000,
    rateLimitWindowMs: 60000, // 1 minute
    maxMessagesPerWindow: 20,
    persistenceEnabled: false // Disable persistence by default
  })).inSingletonScope();

  // Message Processing
  container.bind<MessageProcessor>(TYPES.MessageProcessor).to(MessageProcessor).inSingletonScope();
  container.bind<MessageValidator>(TYPES.MessageValidator).to(MessageValidator).inSingletonScope();
  container.bind<TweetFormatter>(TYPES.TweetFormatter).to(EnhancedMessageFormatter).inSingletonScope();
  container.bind<FilterPipeline>(TYPES.FilterPipeline).to(FilterPipeline).inSingletonScope();

  // Topic Management
  container.bind<TopicManager>(TYPES.TopicManager).to(TopicManager).inSingletonScope();
  container.bind<TopicFilterManager>(TYPES.TopicFilterManager).to(TopicFilterManager).inSingletonScope();

  // Validation
  container.bind<DateValidator>(TYPES.DateValidator).to(DateValidator).inSingletonScope();

  // Initialize DateValidator with SearchConfig to break circular dependency
  const dateValidator = container.get<DateValidator>(TYPES.DateValidator);
  const searchConfig = container.get<SearchConfig>(TYPES.SearchConfig);
  dateValidator.setSearchConfig(searchConfig);

  return container;
}

export function initializeContainer(): Container {
  const container = createContainer();
  
  // Initialize database
  const dbManager = container.get<DatabaseManager>(TYPES.DatabaseManager);
  dbManager.initialize().catch(error => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });

  return container;
}
