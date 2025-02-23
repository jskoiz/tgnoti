import { TwitterClient } from '../src/twitter/twitterClient.js';
import { RettiwtKeyManager } from '../src/twitter/rettiwtKeyManager.js';
import { RateLimitedQueue } from '../src/core/RateLimitedQueue.js';
import { Logger } from '../src/types/logger.js';
import { MetricsManager } from '../src/types/metrics.js';
import { Tweet, TweetFilter } from '../src/types/twitter.js';

describe('TwitterClient', () => {
  let client: TwitterClient;
  let logger: jest.Mocked<Logger>;
  let metrics: jest.Mocked<MetricsManager>;
  let queue: jest.Mocked<RateLimitedQueue>;
  let keyManager: jest.Mocked<RettiwtKeyManager>;
  let mockTweet: Tweet;
  let mockFilter: TweetFilter;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    metrics = {
      increment: jest.fn(),
      timing: jest.fn(),
      decrement: jest.fn(),
      gauge: jest.fn(),
    };

    queue = {
      add: jest.fn(),
      initialize: jest.fn(),
    } as any;

    keyManager = {
      getCurrentKey: jest.fn().mockReturnValue('test-key'),
      markKeyError: jest.fn(),
      markKeySuccess: jest.fn(),
      rotateKey: jest.fn(),
      getKeyCount: jest.fn(),
      setRotationInterval: jest.fn(),
    } as any;

    client = new TwitterClient(logger, metrics, queue, keyManager);

    mockTweet = {
      id: '123',
      text: 'Test tweet',
      createdAt: new Date().toISOString(),
      tweetBy: {
        userName: 'testuser',
        displayName: 'Test User',
        fullName: 'Test User',
        followersCount: 100,
        followingCount: 100,
        statusesCount: 100,
        verified: false,
        isVerified: false,
        createdAt: new Date().toISOString()
      },
      replyCount: 0,
      retweetCount: 0,
      likeCount: 0,
      viewCount: 0
    };

    mockFilter = {
      fromUsers: ['@testuser'],
      mentions: ['@mentioned'],
      includeWords: ['test'],
      language: 'en',
    };
  });

  describe('searchTweets', () => {
    it('should execute search successfully', async () => {
      queue.add.mockResolvedValueOnce({
        data: [mockTweet],
        meta: { next_token: undefined },
      });

      const result = await client.searchTweets(mockFilter);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(mockTweet);
      expect(metrics.increment).toHaveBeenCalledWith('twitter.search.attempt');
      expect(metrics.increment).toHaveBeenCalledWith('twitter.search.success');
      expect(keyManager.markKeySuccess).toHaveBeenCalled();
    });

    it('should handle rate limits by rotating keys', async () => {
      const rateLimitError = { status: 429 };
      queue.add.mockRejectedValueOnce(rateLimitError);
      queue.add.mockResolvedValueOnce({
        data: [mockTweet],
        meta: { next_token: undefined },
      });

      const result = await client.searchTweets(mockFilter);

      expect(result.data).toHaveLength(1);
      expect(keyManager.markKeyError).toHaveBeenCalledWith(expect.objectContaining({
        code: 429,
      }));
      expect(metrics.increment).toHaveBeenCalledWith('twitter.search.ratelimit');
    });

    it('should retry on temporary errors', async () => {
      const tempError = { status: 503 };
      queue.add.mockRejectedValueOnce(tempError);
      queue.add.mockResolvedValueOnce({
        data: [mockTweet],
        meta: { next_token: undefined },
      });

      const result = await client.searchTweets(mockFilter);

      expect(result.data).toHaveLength(1);
      expect(metrics.increment).toHaveBeenCalledWith('twitter.search.retry');
    });

    it('should sanitize search parameters', async () => {
      queue.add.mockResolvedValueOnce({
        data: [mockTweet],
        meta: { next_token: undefined },
      });

      await client.searchTweets({
        ...mockFilter,
        fromUsers: ['@user1', 'user2'],
        mentions: ['@mention1', 'mention2'],
      });

      expect(queue.add).toHaveBeenCalledWith(expect.any(Function));
      const queueFn = queue.add.mock.calls[0][0];
      const result = await queueFn();

      expect(result).toBeDefined();
      expect(metrics.increment).toHaveBeenCalledWith('twitter.search.success');
    });

    it('should handle search errors properly', async () => {
      const searchError = new Error('Search failed');
      queue.add.mockRejectedValueOnce(searchError);

      await expect(client.searchTweets(mockFilter)).rejects.toThrow('Search failed');
      expect(metrics.increment).toHaveBeenCalledWith('twitter.search.error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error searching tweets:',
        expect.any(Object)
      );
    });

    it('should track search timing metrics', async () => {
      queue.add.mockResolvedValueOnce({
        data: [mockTweet],
        meta: { next_token: undefined },
      });

      await client.searchTweets(mockFilter);

      expect(metrics.timing).toHaveBeenCalledWith(
        'twitter.search.duration',
        expect.any(Number)
      );
    });
  });

  describe('error handling', () => {
    it('should wrap errors in appropriate types', async () => {
      const error = new Error('API Error');
      queue.add.mockRejectedValueOnce(error);

      await expect(client.searchTweets({} as TweetFilter)).rejects.toMatchObject({
        code: 500,
        message: 'API Error',
      });
    });

    it('should preserve error details', async () => {
      const error = {
        code: 400,
        message: 'Invalid request',
        details: { field: 'query' },
      };
      queue.add.mockRejectedValueOnce(error);

      await expect(client.searchTweets({} as TweetFilter)).rejects.toMatchObject({
        code: 400,
        message: 'Invalid request',
        details: { field: 'query' },
      });
    });
  });
});