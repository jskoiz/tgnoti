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

  // Utils
  Logger: Symbol.for('Logger'),
  ErrorHandler: Symbol.for('ErrorHandler'),
  MetricsManager: Symbol.for('MetricsManager'),
  CircuitBreaker: Symbol.for('CircuitBreaker'),
  MessageValidator: Symbol.for('MessageValidator'),
  Sanitizer: Symbol.for('Sanitizer'),
};