const TYPES = {
  // Core services
  Logger: Symbol.for('Logger'),
  LogService: Symbol.for('LogService'),
  LoggerFactory: Symbol.for('LoggerFactory'),
  ConfigManager: Symbol.for('ConfigManager'),
  Storage: Symbol.for('Storage'),
  DatabaseManager: Symbol.for('DatabaseManager'),
  MongoDBManager: Symbol.for('MongoDBManager'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  CircuitBreaker: Symbol.for('CircuitBreaker'),
  RettiwtErrorHandler: Symbol.for('RettiwtErrorHandler'),
  CircuitBreakerConfig: Symbol.for('CircuitBreakerConfig'),
  UsernameHandler: Symbol.for('UsernameHandler'),
  MetricsManager: Symbol.for('MetricsManager'),
  EventBus: Symbol.for('EventBus'),
  MonitoringDashboard: Symbol.for('MonitoringDashboard'),

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
  MessageFormatter: Symbol.for('MessageFormatter'),
  MessageStorage: Symbol.for('MessageStorage'),

  // Pipeline components
  TweetProcessingPipeline: Symbol.for('TweetProcessingPipeline'),
  FetchStage: Symbol.for('FetchStage'),
  FilterStage: Symbol.for('FilterStage'),
  ValidationStage: Symbol.for('ValidationStage'),
  FormatStage: Symbol.for('FormatStage'),
  SendStage: Symbol.for('SendStage'),

  // Queue management
  RateLimitedQueue: Symbol.for('RateLimitedQueue'),
  MessageProcessor: Symbol.for('MessageProcessor'),

  // Configuration
  LoggingConfig: Symbol.for('LoggingConfig'),
  PipelineConfig: Symbol.for('PipelineConfig'),
  Environment: Symbol.for('Environment'),
  SearchConfig: Symbol.for('SearchConfig'),
  TweetTrackingConfig: Symbol.for('TweetTrackingConfig'),
  TelegramConfig: Symbol.for('TelegramConfig'),
  TelegramQueueConfig: Symbol.for('TelegramQueueConfig'),
  BasePath: Symbol.for('BasePath'),
  DateValidator: Symbol.for('DateValidator'),
  TweetFormatter: Symbol.for('TweetFormatter'),
  MessageValidator: Symbol.for('MessageValidator'),
  TwitterNotifier: Symbol.for('TwitterNotifier'),
  TweetMonitor: Symbol.for('TweetMonitor'),
  
  // Event system
  EventProcessor: Symbol.for('EventProcessor'),
  EligibilityHandler: Symbol.for('EligibilityHandler'),
  FormatterHandler: Symbol.for('FormatterHandler'),
  SenderHandler: Symbol.for('SenderHandler')
};

export { TYPES };