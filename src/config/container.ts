import './initialization.js';
import { Container } from 'inversify';
import { TwitterClient } from '../twitter/twitterClient.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { ConsoleLogger } from '../utils/logger.js';
import { ConfigManager } from './ConfigManager.js';
import { ErrorHandler } from '../utils/ErrorHandler.js';
import { MetricsManager } from '../utils/MetricsManager.js';
import { MessageProcessor } from '../core/MessageProcessor.js';
import { FilterPipeline } from '../core/FilterPipeline.js';
import { RateLimitedQueue } from '../core/RateLimitedQueue.js';
import { TweetMonitor } from '../core/TweetMonitor.js';
import { TwitterNotifier } from '../core/TwitterNotifier.js';
import { MessageValidator } from '../utils/messageValidator.js';
import { Environment } from './environment.js';
import { TwitterConfigValidator } from './twitter.js';
import { Sanitizer } from '../utils/sanitizer.js';
import { Storage } from '../storage/storage.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { SearchBuilder } from '../twitter/searchBuilder.js';
import { TYPES } from '../types/di.js';

export const container = new Container({ defaultScope: "Singleton" });

// Configuration
container.bind(TYPES.ConfigManager).to(ConfigManager).inSingletonScope();
container.bind(TYPES.Environment).to(Environment).inSingletonScope();
container.bind(TYPES.TwitterConfigValidator).to(TwitterConfigValidator).inSingletonScope();

// Calculate base path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basePath = path.join(__dirname, '../..');
container.bind(TYPES.BasePath).toConstantValue(basePath);

// Core Services
container.bind(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
container.bind(TYPES.TelegramBot).to(TelegramBot).inSingletonScope();
container.bind(TYPES.TweetMonitor).to(TweetMonitor).inSingletonScope();
container.bind(TYPES.MessageProcessor).to(MessageProcessor).inSingletonScope();
container.bind(TYPES.FilterPipeline).to(FilterPipeline).inSingletonScope();
container.bind(TYPES.RateLimitedQueue).to(RateLimitedQueue).inSingletonScope();
container.bind(TYPES.TwitterNotifier).to(TwitterNotifier).inSingletonScope();
container.bind(TYPES.Storage).to(Storage).inSingletonScope();
container.bind(TYPES.SearchBuilder).to(SearchBuilder).inSingletonScope();

// Utils and Services
container.bind(TYPES.Logger).to(ConsoleLogger).inSingletonScope();
container.bind(TYPES.ErrorHandler).to(ErrorHandler).inSingletonScope();
container.bind(TYPES.MetricsManager).to(MetricsManager).inSingletonScope();
container.bind(TYPES.MessageValidator).to(MessageValidator).inSingletonScope();

// Configure CircuitBreaker with default values
container.bind(TYPES.CircuitBreaker)
  .toDynamicValue(() => new CircuitBreaker(5, 30000, 5000))
  .inSingletonScope();

container.bind(TYPES.Sanitizer).to(Sanitizer).inSingletonScope();

export default container;