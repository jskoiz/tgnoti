import { Container } from 'inversify';
import { TYPES } from '../types/di.js';
import { TweetFormatter } from '../types/telegram.js';
import { SearchConfig } from './searchConfig.js';
import { Environment } from './environment.js';
import { TweetTrackingConfig } from './tweetTracking.js';
import { FileMessageStorage } from '../telegram/storage/messageStorage.js';
import { MessageStorage } from '../telegram/types/messageStorage.js';
import { CircuitBreakerConfig } from '../types/monitoring.js';
import { Logger } from '../types/logger.js';
import { LogService } from '../logging/LogService.js';
import { ConsoleLogger } from '../utils/logger.js';
import { Storage } from '../core/storage/storage.js';
import { DatabaseManager } from '../core/storage/DatabaseManager.js';
import { ConfigManager } from './ConfigManager.js';
import { MongoDBManager } from '../core/storage/MongoDBManager.js';
import { TwitterClient } from '../core/twitter/twitterClient.js';
import { RettiwtSearchBuilder } from '../core/twitter/rettiwtSearchBuilder.js';
import { SearchStrategy } from '../core/twitter/searchStrategy.js';
import { SearchCacheManager } from '../core/twitter/SearchCacheManager.js';
import { TweetMonitor } from '../core/TweetMonitor.js';
import { MessageProcessor } from '../core/MessageProcessor.js';
import { TelegramBot } from '../telegram/bot/telegramBot.js';
import { TopicManager } from '../telegram/bot/TopicManager.js';
import { TopicFilterManager } from '../telegram/bot/TopicFilterManager.js';
import { RettiwtKeyManager } from '../core/twitter/rettiwtKeyManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { RettiwtErrorHandler } from '../core/twitter/RettiwtErrorHandler.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { MessageValidator } from '../utils/messageValidator.js';
import { EnhancedMessageFormatter } from '../telegram/bot/messageFormatter.js';
import { TelegramMessageQueue } from '../telegram/queue/TelegramMessageQueue.js';
import { TelegramMessageSender } from '../telegram/queue/TelegramMessageSender.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { RateLimitedQueue } from '../core/RateLimitedQueue.js';
import { TwitterNotifier } from '../core/TwitterNotifier.js';
import { MonitoringDashboard } from '../core/monitoring/MonitoringDashboard.js';
import { DateValidator } from '../utils/dateValidation.js';
import { TweetProcessingPipeline } from '../core/pipeline/TweetProcessingPipeline.js';
import { FetchStage } from '../core/pipeline/stages/FetchStage.js';
import { ValidationStage } from '../core/pipeline/stages/ValidationStage.js';
import { FilterStage } from '../core/pipeline/stages/FilterStage.js';
import { FormatStage } from '../core/pipeline/stages/FormatStage.js';
import { SendStage } from '../core/pipeline/stages/SendStage.js';
import { UsernameHandler } from '../utils/usernameHandler.js';

// Event-based system
import { EventBus } from '../core/events/EventBus.js';
import { EventProcessor } from '../core/events/EventProcessor.js';
import { EligibilityHandler } from '../core/events/handlers/EligibilityHandler.js';
import { FormatterHandler } from '../core/events/handlers/FormatterHandler.js';
import { SenderHandler } from '../core/events/handlers/SenderHandler.js';
import TelegramBotApi from 'node-telegram-bot-api';
import { TelegramQueueConfig } from '../types/telegram.js';
import { TelegramConfig } from './telegram.js';
import { PipelineConfig } from '../core/pipeline/types/PipelineTypes.js';
import { TelegramBotService } from '../telegram/bot/telegramBotService.js';
import { LoggingConfig } from './loggingConfig.js';
import { LoggerFactory } from '../logging/LoggerFactory.js';
import { DefaultLogService } from '../logging/DefaultLogService.js';

export function createContainer(): Container {
  const container = new Container();

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
  
  // Initialize ConfigManager first
  const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
  configManager.initialize();
  
  container.bind<Environment>(TYPES.Environment).to(Environment).inSingletonScope();  
  container.bind<SearchConfig>(TYPES.SearchConfig).to(SearchConfig).inSingletonScope();
  container.bind<TweetTrackingConfig>(TYPES.TweetTrackingConfig).to(TweetTrackingConfig).inSingletonScope();
  container.bind<Storage>(TYPES.Storage).to(Storage).inSingletonScope();
  container.bind<DatabaseManager>(TYPES.DatabaseManager).to(DatabaseManager).inSingletonScope();
  container.bind<MongoDBManager>(TYPES.MongoDBManager).to(MongoDBManager).inSingletonScope();
  container.bind<MessageStorage>(TYPES.MessageStorage).to(FileMessageStorage).inSingletonScope();
  container.bind<CircuitBreakerConfig>(TYPES.CircuitBreakerConfig).toConstantValue({
    threshold: 5,
    resetTimeout: 30000, // 30 seconds
    testInterval: 5000   // 5 seconds
  });
  container.bind<ErrorHandler>(TYPES.ErrorHandler).to(ErrorHandler).inSingletonScope();
  container.bind<RettiwtErrorHandler>(TYPES.RettiwtErrorHandler).to(RettiwtErrorHandler).inSingletonScope();
  container.bind<CircuitBreaker>(TYPES.CircuitBreaker).to(CircuitBreaker).inSingletonScope();
  container.bind<MetricsManager>(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
  container.bind<MonitoringDashboard>(TYPES.MonitoringDashboard).to(MonitoringDashboard).inSingletonScope();
  container.bind<UsernameHandler>(TYPES.UsernameHandler).to(UsernameHandler).inSingletonScope();
  
  // Event System
  container.bind<EventBus>(TYPES.EventBus).to(EventBus).inSingletonScope();
  container.bind<EventProcessor>(TYPES.EventProcessor).to(EventProcessor).inSingletonScope();
  container.bind<EligibilityHandler>(TYPES.EligibilityHandler).to(EligibilityHandler).inSingletonScope();
  container.bind<FormatterHandler>(TYPES.FormatterHandler).to(FormatterHandler).inSingletonScope();
  container.bind<SenderHandler>(TYPES.SenderHandler).to(SenderHandler).inSingletonScope();
  container.bind<RateLimitedQueue>(TYPES.RateLimitedQueue).to(RateLimitedQueue).inSingletonScope();

  // Twitter Related
  container.bind<TwitterClient>(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
  container.bind<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder).to(RettiwtSearchBuilder).inSingletonScope();
  container.bind<SearchStrategy>(TYPES.SearchStrategy).to(SearchStrategy).inSingletonScope();
  container.bind<SearchCacheManager>(TYPES.SearchCacheManager).to(SearchCacheManager).inSingletonScope();
  container.bind<TweetMonitor>(TYPES.TweetMonitor).to(TweetMonitor).inSingletonScope();
  container.bind<TwitterNotifier>(TYPES.TwitterNotifier).to(TwitterNotifier).inSingletonScope();
  
  // Pipeline Configuration
  container.bind<PipelineConfig>(TYPES.PipelineConfig).toConstantValue({
    enableValidation: true,
    enableFiltering: true,
    enableFormatting: true,
    retryCount: 3,
    timeoutMs: 30000
  });
  container.bind<TweetProcessingPipeline>(TYPES.TweetProcessingPipeline).to(TweetProcessingPipeline).inSingletonScope();
  
  // Pipeline Stages
  container.bind<FetchStage>(TYPES.FetchStage).to(FetchStage).inSingletonScope();
  container.bind<ValidationStage>(TYPES.ValidationStage).to(ValidationStage).inSingletonScope();
  container.bind<FilterStage>(TYPES.FilterStage).to(FilterStage).inSingletonScope();
  container.bind<FormatStage>(TYPES.FormatStage).to(FormatStage).inSingletonScope();
  container.bind<SendStage>(TYPES.SendStage).to(SendStage).inSingletonScope();
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

  // Validation
  container.bind<DateValidator>(TYPES.DateValidator).to(DateValidator).inSingletonScope();

  // Initialize DateValidator with SearchConfig to break circular dependency
  const dateValidator = container.get<DateValidator>(TYPES.DateValidator);
  const searchConfig = container.get<SearchConfig>(TYPES.SearchConfig);
  dateValidator.setSearchConfig(searchConfig);
  
  // Initialize tweet tracking
  container.get<TweetTrackingConfig>(TYPES.TweetTrackingConfig).initialize();

  return container;
}

export async function initializeContainer(): Promise<Container> {
  const container = createContainer();
  
  // Initialize database
  await Promise.all([
    container.get<DatabaseManager>(TYPES.DatabaseManager).initialize(),
    container.get<MongoDBManager>(TYPES.MongoDBManager).initialize()
  ]).catch(error => {
    if (error instanceof Error) {
      console.error('Failed to initialize databases:', error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error('Failed to initialize databases:', error);
    }
    process.exit(1);
  });

  // Initialize pipeline
  const pipeline = container.get<TweetProcessingPipeline>(TYPES.TweetProcessingPipeline);
  const fetchStage = container.get<FetchStage>(TYPES.FetchStage);
  const validationStage = container.get<ValidationStage>(TYPES.ValidationStage);
  const filterStage = container.get<FilterStage>(TYPES.FilterStage);
  const formatStage = container.get<FormatStage>(TYPES.FormatStage);
  const sendStage = container.get<SendStage>(TYPES.SendStage);
  
  // Add stages in order
  [fetchStage, validationStage, filterStage, formatStage, sendStage].forEach(stage => pipeline.addStage(stage));
  
  // Initialize event handlers
  // Just getting these instances will trigger their constructors which register event handlers
  container.get<EventBus>(TYPES.EventBus);
  container.get<EligibilityHandler>(TYPES.EligibilityHandler);
  container.get<FormatterHandler>(TYPES.FormatterHandler);
  container.get<SenderHandler>(TYPES.SenderHandler);

  return container;
}
