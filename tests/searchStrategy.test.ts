import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { SearchStrategy } from '../src/twitter/searchStrategy.js';
import { TwitterClient } from '../src/twitter/twitterClient.js';
import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import { SearchCacheManager } from '../src/twitter/SearchCacheManager.js';
import { Logger } from '../src/types/logger.js';
import { Tweet, SearchResponse, SearchQueryConfig, TweetUser } from '../src/types/twitter.js';

describe('SearchStrategy', () => {
  let container: Container;
  let searchStrategy: SearchStrategy;
  let mockTwitterClient: jest.Mocked<TwitterClient>;
  let mockSearchBuilder: jest.Mocked<RettiwtSearchBuilder>;
  let mockCacheManager: jest.Mocked<SearchCacheManager>;
  let mockLogger: jest.Mocked<Logger>;

  const mockUser: TweetUser = {
    userName: 'testuser',
    displayName: 'Test User',
    fullName: 'Test User',
    description: 'Test user description',
    followersCount: 100,
    followingCount: 50,
    statusesCount: 1000,
    verified: false,
    isVerified: false,
    verifiedType: 'none',
    createdAt: '2024-01-01T00:00:00Z'
  };

  const mockTweet: Tweet = {
    id: '123',
    text: 'Test tweet',
    createdAt: '2025-02-21T12:00:00Z',
    tweetBy: mockUser,
    replyCount: 0,
    retweetCount: 0,
    likeCount: 0,
    viewCount: 0
  };

  const mockSearchResponse: SearchResponse = {
    data: [mockTweet],
    meta: {
      next_token: 'next_page_token'
    }
  };

  beforeEach(() => {
    container = new Container();

    // Create mocks
    mockTwitterClient = {
      searchTweets: jest.fn().mockResolvedValue(mockSearchResponse)
    } as unknown as jest.Mocked<TwitterClient>;

    mockSearchBuilder = {
      buildFilter: jest.fn().mockReturnValue({})
    } as unknown as jest.Mocked<RettiwtSearchBuilder>;

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      cleanup: jest.fn(),
      startCleanupInterval: jest.fn()
    } as unknown as jest.Mocked<SearchCacheManager>;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as unknown as jest.Mocked<Logger>;

    // Bind mocks to container
    container.bind<TwitterClient>(TYPES.TwitterClient).toConstantValue(mockTwitterClient);
    container.bind<RettiwtSearchBuilder>(TYPES.RettiwtSearchBuilder).toConstantValue(mockSearchBuilder);
    container.bind<SearchCacheManager>(TYPES.SearchCacheManager).toConstantValue(mockCacheManager);
    container.bind<Logger>(TYPES.Logger).toConstantValue(mockLogger);
    container.bind<SearchStrategy>(TYPES.SearchStrategy).to(SearchStrategy);

    // Get instance of SearchStrategy
    searchStrategy = container.get<SearchStrategy>(TYPES.SearchStrategy);
  });

  describe('search', () => {
    it('should perform sequential searches and deduplicate results', async () => {
      const searchTopic = {
        username: 'testuser',
        startDate: new Date('2025-02-20'),
        endDate: new Date('2025-02-21')
      };

      const result = await searchStrategy.search(searchTopic);

      expect(mockTwitterClient.searchTweets).toHaveBeenCalledTimes(3);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockTweet.id);
    });

    it('should use cache when available', async () => {
      mockCacheManager.get.mockResolvedValueOnce([mockTweet]);

      const searchTopic = {
        username: 'testuser'
      };

      const result = await searchStrategy.search(searchTopic);

      expect(mockTwitterClient.searchTweets).not.toHaveBeenCalled();
      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockTweet.id);
    });
  });

  describe('searchWithPagination', () => {
    it('should return paginated results', async () => {
      const searchConfig: SearchQueryConfig = {
        type: 'structured',
        accounts: ['testuser'],
        language: 'en'
      };

      const result = await searchStrategy.searchWithPagination(searchConfig, 100);

      expect(result.tweets).toHaveLength(1);
      expect(result.cursor.nextToken).toBe('next_page_token');
      expect(result.cursor.hasMore).toBe(true);
    });

    it('should use cache when available', async () => {
      mockCacheManager.get.mockResolvedValueOnce([mockTweet]);

      const searchConfig: SearchQueryConfig = {
        type: 'structured',
        accounts: ['testuser'],
        language: 'en'
      };

      const result = await searchStrategy.searchWithPagination(searchConfig);

      expect(mockTwitterClient.searchTweets).not.toHaveBeenCalled();
      expect(mockCacheManager.get).toHaveBeenCalled();
      expect(result.tweets).toHaveLength(1);
      expect(result.cursor.hasMore).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle search errors gracefully', async () => {
      mockTwitterClient.searchTweets.mockRejectedValueOnce(new Error('API Error'));

      const searchTopic = {
        username: 'testuser'
      };

      const result = await searchStrategy.search(searchTopic);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it('should handle cache errors gracefully', async () => {
      mockCacheManager.get.mockRejectedValueOnce(new Error('Cache Error'));

      const searchConfig: SearchQueryConfig = {
        type: 'structured',
        accounts: ['testuser'],
        language: 'en'
      };

      const result = await searchStrategy.searchWithPagination(searchConfig);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.tweets).toBeDefined();
      expect(result.cursor).toBeDefined();
    });
  });
});