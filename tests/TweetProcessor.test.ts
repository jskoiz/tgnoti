import { TweetProcessor } from '../src/core/TweetProcessor.js';
import { Logger } from '../src/types/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import { DateValidator } from '../src/utils/dateValidation.js';
import { TelegramBot } from '../src/bot/telegramBot.js';
import { TwitterClient } from '../src/twitter/twitterClient.js';
import { Storage } from '../src/storage/storage.js';
import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import { EnhancedMessageFormatter } from '../src/bot/messageFormatter.js';
import { Tweet } from '../src/types/twitter.js';

// Mock implementations
class MockLogger implements Logger {
  logs: { level: string; message: string; args: any[] }[] = [];
  debug(message: string, ...args: any[]): void {
    this.logs.push({ level: 'debug', message, args });
  }
  info(message: string, ...args: any[]): void {
    this.logs.push({ level: 'info', message, args });
  }
  warn(message: string, error?: Error | Record<string, unknown>): void {
    this.logs.push({ level: 'warn', message, args: [error] });
  }
  error(message: string, error?: Error | Record<string, unknown>): void {
    this.logs.push({ level: 'error', message, args: [error] });
  }
}

class MockMetricsManager extends MetricsManager {
  constructor() {
    super(new MockLogger());
  }

  // Override methods to avoid logging
  increment(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue + value);
  }

  decrement(metric: string, value: number = 1): void {
    const currentValue = this.metrics.get(metric) || 0;
    this.metrics.set(metric, currentValue - value);
  }

  gauge(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }

  timing(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }
}

describe('TweetProcessor', () => {
  let processor: TweetProcessor;
  let mockLogger: MockLogger;
  let mockMetrics: MockMetricsManager;
  let mockErrorHandler: ErrorHandler;
  let mockDateValidator: jest.Mocked<DateValidator>;
  let mockTelegramBot: jest.Mocked<TelegramBot>;
  let mockTwitterClient: jest.Mocked<TwitterClient>;
  let mockStorage: jest.Mocked<Storage>;
  let mockSearchBuilder: jest.Mocked<RettiwtSearchBuilder>;
  let mockTweetFormatter: jest.Mocked<EnhancedMessageFormatter>;

  beforeEach(() => {
    mockLogger = new MockLogger();
    mockMetrics = new MockMetricsManager();
    mockErrorHandler = new ErrorHandler(mockLogger, mockMetrics);

    mockDateValidator = {
      validateSystemTime: jest.fn(),
      validateSearchWindow: jest.fn(),
      validateTweetDate: jest.fn().mockReturnValue(true)
    } as unknown as jest.Mocked<DateValidator>;

    mockTelegramBot = {
      sendMessage: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<TelegramBot>;

    mockTwitterClient = {
      searchTweets: jest.fn().mockResolvedValue([])
    } as unknown as jest.Mocked<TwitterClient>;

    mockStorage = {
      getConfig: jest.fn().mockResolvedValue({
        twitter: {
          searchQueries: {
            '381': {
              type: 'structured',
              keywords: ['test'],
              language: 'en'
            }
          }
        }
      }),
      hasSeen: jest.fn().mockResolvedValue(false),
      markSeen: jest.fn().mockResolvedValue(undefined),
      updateLastTweetId: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<Storage>;

    mockSearchBuilder = {
      buildFilter: jest.fn().mockReturnValue({})
    } as unknown as jest.Mocked<RettiwtSearchBuilder>;

    mockTweetFormatter = {
      formatMessage: jest.fn().mockReturnValue('Formatted message'),
      createMessageButtons: jest.fn().mockReturnValue([])
    } as unknown as jest.Mocked<EnhancedMessageFormatter>;

    processor = new TweetProcessor(
      mockLogger,
      mockTelegramBot,
      mockTwitterClient,
      mockStorage,
      mockSearchBuilder,
      mockTweetFormatter,
      mockDateValidator,
      mockMetrics,
      mockErrorHandler
    );
  });

  describe('processNewTweets', () => {
    it('should process tweets successfully', async () => {
      const mockTweet: Tweet = {
        id: '123',
        text: 'Test tweet',
        createdAt: new Date().toISOString(),
        tweetBy: {
          userName: 'testuser',
          displayName: 'Test User',
          followersCount: 100,
          followingCount: 50,
          verified: false,
          verifiedType: 'none'
        },
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      };

      mockTwitterClient.searchTweets.mockResolvedValueOnce([mockTweet]);

      const result = await processor.processNewTweets();

      expect(result.totalFound).toBe(1);
      expect(result.totalProcessed).toBe(1);
      expect(result.totalSent).toBe(1);
      expect(result.totalErrors).toBe(0);
      expect(result.processingTimeMs).toBeGreaterThan(0);

      expect(mockDateValidator.validateSearchWindow).toHaveBeenCalled();
      expect(mockSearchBuilder.buildFilter).toHaveBeenCalled();
      expect(mockTwitterClient.searchTweets).toHaveBeenCalled();
      expect(mockStorage.hasSeen).toHaveBeenCalledWith('123', '381');
      expect(mockStorage.markSeen).toHaveBeenCalledWith('123', '381');
      expect(mockTelegramBot.sendMessage).toHaveBeenCalled();
    });

    it('should handle invalid tweet dates', async () => {
      const mockTweet: Tweet = {
        id: '123',
        text: 'Test tweet',
        createdAt: '2025-01-01T00:00:00Z',
        tweetBy: {
          userName: 'testuser',
          displayName: 'Test User',
          followersCount: 100,
          followingCount: 50,
          verified: false,
          verifiedType: 'none'
        },
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      };

      mockTwitterClient.searchTweets.mockResolvedValueOnce([mockTweet]);
      mockDateValidator.validateTweetDate.mockReturnValueOnce(false);

      const result = await processor.processNewTweets();

      expect(result.totalFound).toBe(1);
      expect(result.totalProcessed).toBe(1);
      expect(result.totalSent).toBe(0);
      expect(result.totalErrors).toBe(0);

      expect(mockStorage.markSeen).not.toHaveBeenCalled();
      expect(mockTelegramBot.sendMessage).not.toHaveBeenCalled();
      expect(mockLogger.logs).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          message: expect.stringContaining('Skipping tweet 123')
        })
      );
    });

    it('should handle already seen tweets', async () => {
      const mockTweet: Tweet = {
        id: '123',
        text: 'Test tweet',
        createdAt: new Date().toISOString(),
        tweetBy: {
          userName: 'testuser',
          displayName: 'Test User',
          followersCount: 100,
          followingCount: 50,
          verified: false,
          verifiedType: 'none'
        },
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      };

      mockTwitterClient.searchTweets.mockResolvedValueOnce([mockTweet]);
      mockStorage.hasSeen.mockResolvedValueOnce(true);

      const result = await processor.processNewTweets();

      expect(result.totalFound).toBe(1);
      expect(result.totalProcessed).toBe(1);
      expect(result.totalSent).toBe(0);
      expect(result.totalErrors).toBe(0);

      expect(mockStorage.markSeen).not.toHaveBeenCalled();
      expect(mockTelegramBot.sendMessage).not.toHaveBeenCalled();
    });

    it('should handle telegram send failures', async () => {
      const mockTweet: Tweet = {
        id: '123',
        text: 'Test tweet',
        createdAt: new Date().toISOString(),
        tweetBy: {
          userName: 'testuser',
          displayName: 'Test User',
          followersCount: 100,
          followingCount: 50,
          verified: false,
          verifiedType: 'none'
        },
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      };

      mockTwitterClient.searchTweets.mockResolvedValueOnce([mockTweet]);
      mockTelegramBot.sendMessage.mockRejectedValueOnce(new Error('Send failed'));

      const result = await processor.processNewTweets();

      expect(result.totalFound).toBe(1);
      expect(result.totalProcessed).toBe(1);
      expect(result.totalSent).toBe(0);
      expect(result.totalErrors).toBe(1);

      expect(mockStorage.markSeen).not.toHaveBeenCalled();
      expect(mockLogger.logs).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('Send tweet 123')
        })
      );
    });

    it('should record metrics', async () => {
      const mockTweet: Tweet = {
        id: '123',
        text: 'Test tweet',
        createdAt: new Date().toISOString(),
        tweetBy: {
          userName: 'testuser',
          displayName: 'Test User',
          followersCount: 100,
          followingCount: 50,
          verified: false,
          verifiedType: 'none'
        },
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      };

      mockTwitterClient.searchTweets.mockResolvedValueOnce([mockTweet]);

      await processor.processNewTweets();

      expect(mockMetrics.getValue('tweet.processing.cycles')).toBe(1);
      expect(mockMetrics.getValue('tweet.found.381')).toBe(1);
      expect(mockMetrics.getValue('tweet.processing.total_found')).toBe(1);
      expect(mockMetrics.getValue('tweet.processing.total_processed')).toBe(1);
      expect(mockMetrics.getValue('tweet.processing.total_sent')).toBe(1);
      expect(mockMetrics.getValue('tweet.processing.total_errors')).toBe(0);
      expect(mockMetrics.getValue('tweet.processing.total_time')).toBeGreaterThan(0);
    });
  });
});