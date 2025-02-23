export const TYPES = {
  // Core Services
  Logger: Symbol.for('Logger'),
  ConfigManager: Symbol.for('ConfigManager'),
  Storage: Symbol.for('Storage'),
  DatabaseManager: Symbol.for('DatabaseManager'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  CircuitBreaker: Symbol.for('CircuitBreaker'),
  CircuitBreakerConfig: Symbol.for('CircuitBreakerConfig'),
  MetricsManager: Symbol.for('MetricsManager'),
  
  // Twitter Related
  TwitterClient: Symbol.for('TwitterClient'),
  TwitterNotifier: Symbol.for('TwitterNotifier'),
  RettiwtSearchBuilder: Symbol.for('RettiwtSearchBuilder'),
  RettiwtKeyManager: Symbol.for('RettiwtKeyManager'),
  SearchStrategy: Symbol.for('SearchStrategy'),
  SearchCacheManager: Symbol.for('SearchCacheManager'),
  TweetProcessor: Symbol.for('TweetProcessor'),
  TweetMonitor: Symbol.for('TweetMonitor'),
  TweetFormatter: Symbol.for('TweetFormatter'),
  
  // Telegram Related
  TelegramBot: Symbol.for('TelegramBot'),
  TelegramMessageQueue: Symbol.for('TelegramMessageQueue'),
  TelegramMessageSender: Symbol.for('TelegramMessageSender'),
  TelegramQueueConfig: Symbol.for('TelegramQueueConfig'),
  
  // Message Processing
  MessageProcessor: Symbol.for('MessageProcessor'),
  MessageValidator: Symbol.for('MessageValidator'),
  MessageFormatter: Symbol.for('MessageFormatter'),
  FilterPipeline: Symbol.for('FilterPipeline'),
  MessageStorage: Symbol.for('MessageStorage'),
  
  // Topic Management
  TopicManager: Symbol.for('TopicManager'),
  TopicFilterManager: Symbol.for('TopicFilterManager'),
  
  // Configuration
  Environment: Symbol.for('Environment'),
  SearchConfig: Symbol.for('SearchConfig'),
  DateValidator: Symbol.for('DateValidator'),
  
  // System
  BasePath: Symbol.for('BasePath'),
  RateLimitedQueue: Symbol.for('RateLimitedQueue')
};