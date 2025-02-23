import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { TelegramBot } from '../src/bot/telegramBot.js';
import { Tweet, TweetUser } from '../src/types/twitter.js';
import { TwitterClient } from '../src/twitter/twitterClient.js';
import { CircuitBreaker } from '../src/utils/circuitBreaker.js';
import { ConfigManager } from '../src/config/ConfigManager.js';
import { Environment } from '../src/config/environment.js';
import { TopicManager } from '../src/bot/TopicManager.js';
import { FileMessageStorage } from '../src/storage/messageStorage.js';
import { MessageStorage } from '../src/types/messageStorage.js';
import { EnhancedMessageFormatter } from '../src/bot/messageFormatter.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import dotenv from 'dotenv';
import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';

// Load environment variables
dotenv.config();

// Create test container
const container = new Container();

async function setupContainer() {
  try {
    // Create and bind logger first
    const logger = new ConsoleLogger();
    container.bind(TYPES.Logger).toConstantValue(logger);
    
    logger.info('Setting up test environment...');
    
    // Create and initialize ConfigManager
    const configManager = new ConfigManager(logger);
    await configManager.initialize();
    container.bind(TYPES.ConfigManager).toConstantValue(configManager);
    
    // Create and bind Environment
    const environment = new Environment(logger, configManager);
    environment.validateEnvironment();
    container.bind(TYPES.Environment).toConstantValue(environment);
    
    // Bind MetricsManager before other dependencies that need it
    const metricsManager = new MetricsManager(logger);
    container.bind(TYPES.MetricsManager).toConstantValue(metricsManager);
    
    // Create and bind ErrorHandler after MetricsManager
    const errorHandler = new ErrorHandler(logger, metricsManager);
    container.bind(TYPES.ErrorHandler).toConstantValue(errorHandler);
    
    // Bind RettiwtSearchBuilder with all required dependencies
    const searchBuilder = new RettiwtSearchBuilder(logger, metricsManager, errorHandler);
    container.bind(TYPES.RettiwtSearchBuilder).toConstantValue(searchBuilder);
    
    // Bind TwitterClient and other dependencies that need MetricsManager
    container.bind(TYPES.TwitterClient).to(TwitterClient).inSingletonScope();
    
    // Bind TelegramBot and remaining dependencies
    container.bind(TYPES.TelegramBot).to(TelegramBot).inSingletonScope();
    container.bind(TYPES.CircuitBreaker).to(CircuitBreaker).inSingletonScope();
    container.bind(TYPES.TopicManager).to(TopicManager).inSingletonScope();
    container.bind<MessageStorage>(TYPES.MessageStorage).to(FileMessageStorage).inSingletonScope();
    container.bind(TYPES.TweetFormatter).to(EnhancedMessageFormatter).inSingletonScope();
    
    // Mock affiliate monitor
    container.bind(Symbol.for('AffiliateMonitor')).toConstantValue({
      startMonitoring: async () => {},
      stopMonitoring: async () => {},
      getMonitoredOrgs: async () => [],
      checkAffiliates: async () => ({ cached: false, changes: { added: [] } })
    });
    
    logger.info('Container setup complete');
  } catch (error) {
    console.error('Failed to setup container:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

// Create a mock tweet
const mockUser: TweetUser = {
  userName: 'testuser',
  displayName: 'Test User',
  followersCount: 1000,
  followingCount: 500,
  verified: true,
  verifiedType: 'blue'
};

const mockTweet: Tweet = {
  id: '123456789',
  text: 'This is a test tweet with the new format! 🚀\n\nIt includes multiple lines\nand some emojis 🌟',
  createdAt: new Date().toISOString(),
  tweetBy: mockUser,
  replyCount: 42,
  retweetCount: 100,
  likeCount: 500,
  viewCount: 1000,
  media: [{
    url: 'https://example.com/image.jpg',
    type: 'photo'
  }]
};

async function main() {
  await setupContainer();
  
  const logger = container.get<ConsoleLogger>(TYPES.Logger);
  
  try {
    logger.info('Getting TelegramBot instance...');
    // Get bot instance from container
    const bot = container.get<TelegramBot>(TYPES.TelegramBot);

    // Initialize the bot
    logger.info('Initializing bot...');
    await bot.initialize();

    // Send test notification
    logger.info('Sending test notification...');
    await bot.sendTweet(mockTweet);
    logger.info('Test notification sent successfully!');

    // Stop the bot
    await bot.stop();
  } catch (error) {
    logger.error('Failed to send test notification:', error instanceof Error ? error : new Error(String(error)));
  }
}

main().catch(console.error);