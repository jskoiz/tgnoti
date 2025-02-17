export const TYPES = {
  // Core Services
  TwitterClient: Symbol.for('TwitterClient'),
  TelegramBot: Symbol.for('TelegramBot'),
  TweetMonitor: Symbol.for('TweetMonitor'),
  MessageProcessor: Symbol.for('MessageProcessor'),
  FilterPipeline: Symbol.for('FilterPipeline'),
  RateLimitedQueue: Symbol.for('RateLimitedQueue'),
  TwitterNotifier: Symbol.for('TwitterNotifier'),
  Storage: Symbol.for('Storage'),
  SearchBuilder: Symbol.for('SearchBuilder'),

  // Configuration
  ConfigManager: Symbol.for('ConfigManager'),
  Environment: Symbol.for('Environment'),
  TwitterConfigValidator: Symbol.for('TwitterConfigValidator'),
  BasePath: Symbol.for('BasePath'),

  // Utils and Services
  Logger: Symbol.for('Logger'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  MetricsManager: Symbol.for('MetricsManager'),
  MessageValidator: Symbol.for('MessageValidator'),
  CircuitBreaker: Symbol.for('CircuitBreaker'),
  TopicManager: Symbol.for('TopicManager'),
  Sanitizer: Symbol.for('Sanitizer'),
};

export const AFFILIATE_TYPES = {
  AffiliateMonitor: Symbol.for('AffiliateMonitor'),
  AffiliateStorage: Symbol.for('AffiliateStorage'),
  RettiwtClient: Symbol.for('RettiwtClient'),
  AffiliateConfig: Symbol.for('AffiliateConfig'),
  AffiliateClient: Symbol.for('AffiliateClient'),
};