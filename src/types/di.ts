const TYPES = {
  // Core services
  Logger: Symbol.for('Logger'),
  LogService: Symbol.for('LogService'),
  LoggerFactory: Symbol.for('LoggerFactory'),
  ConfigService: Symbol.for('ConfigService'),
  ConfigManager: Symbol.for('ConfigManager'),
  Storage: Symbol.for('Storage'),
  ConfigStorage: Symbol.for('ConfigStorage'),
  MongoDBService: Symbol.for('MongoDBService'),
  StorageService: Symbol.for('StorageService'),
  TweetProcessor: Symbol.for('TweetProcessor'),
  TelegramService: Symbol.for('TelegramService'),
  TwitterService: Symbol.for('TwitterService'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  CircuitBreaker: Symbol.for('CircuitBreaker'),
  RettiwtErrorHandler: Symbol.for('RettiwtErrorHandler'),
  CircuitBreakerConfig: Symbol.for('CircuitBreakerConfig'),
  UsernameHandler: Symbol.for('UsernameHandler'),
  MetricsManager: Symbol.for('MetricsManager'),
  EnhancedMetricsManager: Symbol.for('EnhancedMetricsManager'),
  EnhancedRateLimiter: Symbol.for('EnhancedRateLimiter'),
  EnhancedTweetMonitor: Symbol.for('EnhancedTweetMonitor'),

  // Twitter services
  TwitterClient: Symbol.for('TwitterClient'),
  RettiwtKeyManager: Symbol.for('RettiwtKeyManager'),
  RettiwtSearchBuilder: Symbol.for('RettiwtSearchBuilder'),
  SearchCacheManager: Symbol.for('SearchCacheManager'),
  SearchStrategy: Symbol.for('SearchStrategy'),

  // Telegram services
  TelegramBot: Symbol.for('TelegramBot'),
  TelegramBotService: Symbol.for('TelegramBotService'),
  TelegramMessageQueue: Symbol.for('TelegramMessageQueue'),
  TelegramMessageSender: Symbol.for('TelegramMessageSender'),
  TopicManager: Symbol.for('TopicManager'),
  TopicFilterManager: Symbol.for('TopicFilterManager'),
  FilterCommandHandler: Symbol.for('FilterCommandHandler'),
  StatsCommandHandler: Symbol.for('StatsCommandHandler'),
  MessageStorage: Symbol.for('MessageStorage'),

  // Queue management
  // RateLimitedQueue has been replaced by EnhancedRateLimiter
  
  // Configuration
  LoggingConfig: Symbol.for('LoggingConfig'),
  Environment: Symbol.for('Environment'),
  SearchConfig: Symbol.for('SearchConfig'),
  TelegramConfig: Symbol.for('TelegramConfig'),
  TelegramQueueConfig: Symbol.for('TelegramQueueConfig'),
  BasePath: Symbol.for('BasePath'),
  DateValidator: Symbol.for('DateValidator'),
  TweetFormatter: Symbol.for('TweetFormatter'),
  MessageValidator: Symbol.for('MessageValidator'),
  MongoDataValidator: Symbol.for('MongoDataValidator'),
};

export { TYPES };
