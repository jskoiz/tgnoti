import { Container } from 'inversify';
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { ConsoleLogger } from '../utils/logger.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { RettiwtSearchBuilder } from '../twitter/rettiwtSearchBuilder.js';
import { SearchStrategy } from '../twitter/searchStrategy.js';
import { SearchCacheManager } from '../twitter/SearchCacheManager.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { RateLimitedQueue } from '../core/RateLimitedQueue.js';
import { ConfigManager } from './ConfigManager.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { TwitterNotifier } from '../core/TwitterNotifier.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { TopicManager } from '../bot/TopicManager.js';
import { FileMessageStorage } from '../storage/messageStorage.js';
import { Environment } from './environment.js';
import { Storage } from '../storage/storage.js';
import { EnhancedMessageFormatter } from '../bot/messageFormatter.js';
import { DateValidator } from '../utils/dateValidation.js';
import { TweetProcessor } from '../core/TweetProcessor.js';
import { RettiwtKeyManager } from '../twitter/rettiwtKeyManager.js';
import { SearchConfig } from '../config/searchConfig.js';
import { TelegramMessageQueue } from '../telegram/TelegramMessageQueue.js';
import { TelegramMessageSender } from '../telegram/TelegramMessageSender.js';
import { TelegramQueueConfig } from '../types/telegram.js';
import TelegramBotApi from 'node-telegram-bot-api';

export async function initializeContainer(): Promise<Container> {
  const container = new Container();

  // Core services
  // Bind base path
  container.bind<string>(TYPES.BasePath).toConstantValue(process.cwd());

  container.bind<Logger>(TYPES.Logger).to(ConsoleLogger).inSingletonScope();
  const logger = container.get<Logger>(TYPES.Logger);

  // Initialize ConfigManager first
  container.bind<ConfigManager>(TYPES.ConfigManager).to(ConfigManager).inSingletonScope();
  const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
  configManager.initialize();

  // Initialize remaining core services
  container.bind<MetricsManager>(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
  container.bind<CircuitBreaker>(TYPES.CircuitBreaker)
    .toDynamicValue((context) => {
      const logger = context.container.get<Logger>(TYPES.Logger);
      return new CircuitBreaker(logger);
    })
    .inSingletonScope();
  container.bind<ErrorHandler>(TYPES.ErrorHandler).to(ErrorHandler).inSingletonScope();
  container.bind<Environment>(TYPES.Environment).to(Environment).inSingletonScope();
  container.bind<DateValidator>(TYPES.DateValidator).to(DateValidator).inSingletonScope();
  container.bind<SearchConfig>(TYPES.SearchConfig).to(SearchConfig).inSingletonScope();
  container.bind<RettiwtKeyManager>(TYPES.RettiwtKeyManager).to(RettiwtKeyManager).inSingletonScope();

  // Initialize DateValidator with SearchConfig
  const dateValidator = container.get<DateValidator>(TYPES.DateValidator);
  const searchConfig = container.get<SearchConfig>(TYPES.SearchConfig);
  
  // Break circular dependency
  dateValidator.setSearchConfig(searchConfig);

  // Initialize rate limiter
  const rateLimitedQueue = new RateLimitedQueue(
    logger,
    container.get<MetricsManager>(TYPES.MetricsManager)
  );
  await rateLimitedQueue.initialize();
  container.bind<RateLimitedQueue>(TYPES.RateLimitedQueue).toConstantValue(rateLimitedQueue);

  // Initialize search components
  container.bind<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder).to(RettiwtSearchBuilder).inSingletonScope();
  container.bind<SearchCacheManager>(TYPES.SearchCacheManager).to(SearchCacheManager).inSingletonScope();
  container.bind<TwitterClient>(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
  container.bind<SearchStrategy>(TYPES.SearchStrategy).to(SearchStrategy).inSingletonScope();

  // Initialize Telegram components in correct order
  container.bind<TopicManager>(TYPES.TopicManager).to(TopicManager).inSingletonScope();
  container.bind<Storage>(TYPES.Storage).to(Storage).inSingletonScope();
  container.bind<FileMessageStorage>(TYPES.MessageStorage).to(FileMessageStorage).inSingletonScope();
  container.bind<EnhancedMessageFormatter>(TYPES.TweetFormatter).to(EnhancedMessageFormatter).inSingletonScope();

  // Create and bind TelegramBotApi instance
  const environment = container.get<Environment>(TYPES.Environment);
  const envConfig = environment.getConfig();
  if (!envConfig.telegram?.api?.botToken) {
    throw new Error('Telegram bot token is missing');
  }
  const botApi = new TelegramBotApi(envConfig.telegram.api.botToken, { polling: false });
  container.bind('TelegramBotApi').toConstantValue(botApi);

  // Initialize TelegramMessageSender before TelegramBot and TelegramMessageQueue
  container.bind(TYPES.TelegramMessageSender).to(TelegramMessageSender).inSingletonScope();

  // Initialize Telegram Message Queue
  const telegramQueueConfig: TelegramQueueConfig = {
    baseDelayMs: 1000,
    rateLimitWindowMs: 60000, // 1 minute
    maxMessagesPerWindow: 20,
    maxRetries: 3,
    maxQueueSize: 1000,
    persistenceEnabled: false
  };
  container.bind<TelegramQueueConfig>(TYPES.TelegramQueueConfig).toConstantValue(telegramQueueConfig);
  container.bind<TelegramMessageQueue>(TYPES.TelegramMessageQueue).to(TelegramMessageQueue).inSingletonScope();

  // Initialize TelegramBot after TelegramMessageSender and TelegramMessageQueue
  container.bind<TelegramBot>(TYPES.TelegramBot).to(TelegramBot).inSingletonScope();
  container.bind<TweetProcessor>(TYPES.TweetProcessor).to(TweetProcessor).inSingletonScope();

  // Initialize TwitterNotifier last
  container.bind<TwitterNotifier>(TYPES.TwitterNotifier).to(TwitterNotifier).inSingletonScope();

  // Start cache cleanup interval
  const cacheManager = container.get<SearchCacheManager>(TYPES.SearchCacheManager);
  cacheManager.startCleanupInterval();

  return container;
}
