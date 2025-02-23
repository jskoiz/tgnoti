import { RettiwtSearchBuilder } from '../src/twitter/rettiwtSearchBuilder.js';
import { Logger } from '../src/types/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import { TweetFilter as BaseTweetFilter } from 'rettiwt-api';

// Test mock class that extends MetricsManager
class TestMetricsManager extends MetricsManager {
  constructor(logger: Logger) {
    super(logger);
  }
}

// Create proper type for mocked metrics
type MockedTestMetricsManager = {
  [K in keyof TestMetricsManager]: jest.Mock;
} & TestMetricsManager;

// Extended interface for our mock filter
interface ExtendedTweetFilter extends BaseTweetFilter {
  operator?: string;
  retweets?: boolean;
}

// Mock TweetFilter for testing
class MockTweetFilter implements ExtendedTweetFilter {
  includeWords: string[];
  language: string;
  links: boolean;
  replies: boolean;
  minLikes: number;
  minReplies: number;
  minRetweets: number;
  startDate?: Date;
  endDate?: Date;
  operator?: string;
  retweets?: boolean;

  constructor(config: Partial<ExtendedTweetFilter>) {
    Object.assign(this, config);
  }
}

// Mock the rettiwt-api module
jest.mock('rettiwt-api', () => ({
  TweetFilter: MockTweetFilter
}));

describe('RettiwtSearchBuilder', () => {
  let searchBuilder: RettiwtSearchBuilder;
  let mockLogger: Logger;
  let mockMetrics: MockedTestMetricsManager;
  let mockErrorHandler: ErrorHandler;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Create instance of test metrics manager
    mockMetrics = new TestMetricsManager(mockLogger) as MockedTestMetricsManager;
    Object.setPrototypeOf(mockMetrics, TestMetricsManager.prototype);
    
    // Mock all methods
    jest.spyOn(mockMetrics, 'increment').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'decrement').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'gauge').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'timing').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'getValue').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'getMetrics').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'reset').mockImplementation(jest.fn());
    jest.spyOn(mockMetrics, 'resetAll').mockImplementation(jest.fn());

    mockErrorHandler = new ErrorHandler(mockLogger, mockMetrics);
    searchBuilder = new RettiwtSearchBuilder(mockLogger, mockMetrics, mockErrorHandler);
  });

  describe('buildSimpleWordSearch', () => {
    it('should create a simple word search filter correctly', () => {
      const filter = searchBuilder.buildSimpleWordSearch('Trojan') as ExtendedTweetFilter;

      expect(filter).toBeInstanceOf(MockTweetFilter);
      expect({
        includeWords: filter.includeWords,
        language: filter.language,
        links: filter.links,
        replies: filter.replies,
        minLikes: filter.minLikes,
        minReplies: filter.minReplies,
        minRetweets: filter.minRetweets
      }).toEqual({
        includeWords: ['trojan'],
        language: 'en',
        links: true,
        replies: true,
        minLikes: 0,
        minReplies: 0,
        minRetweets: 0
      });

      expect(mockMetrics.increment).toHaveBeenCalledWith('search.filters.simple');
    });

    it('should handle invalid words', () => {
      expect(() => searchBuilder.buildSimpleWordSearch('')).toThrow('Search word must be a non-empty string');
      expect(() => searchBuilder.buildSimpleWordSearch('a'.repeat(129))).toThrow('Search word must not exceed 128 characters');
      expect(() => searchBuilder.buildSimpleWordSearch('invalid!@#$')).toThrow('Search word contains invalid characters');
      
      expect(mockMetrics.increment).toHaveBeenCalledWith('search.filters.errors');
    });
  });

  describe('buildFilter', () => {
    describe('validation', () => {
      it('should validate search type', () => {
        const config = {
          type: 'invalid' as any,
          keywords: ['test'],
          language: 'en'
        };

        expect(() => searchBuilder.buildFilter(config)).toThrow('Search type must be "structured"');
        expect(mockMetrics.increment).toHaveBeenCalledWith('search.filters.errors');
      });

      it('should validate language code', () => {
        const config = {
          type: 'structured' as const,
          keywords: ['test'],
          language: 'invalid'
        };

        expect(() => searchBuilder.buildFilter(config)).toThrow('Language must be a valid 2-letter code');
      });

      describe('date validation', () => {
        it('should validate date format', () => {
          const config = {
            type: 'structured' as const,
            keywords: ['test'],
            language: 'en',
            startTime: 'invalid-date'
          };

          expect(() => searchBuilder.buildFilter(config)).toThrow('Invalid startTime format');
        });

        it('should validate date range order', () => {
          const config = {
            type: 'structured' as const,
            keywords: ['test'],
            language: 'en',
            startTime: '2024-02-19T00:00:00.000Z',
            endTime: '2024-02-18T00:00:00.000Z'
          };

          expect(() => searchBuilder.buildFilter(config)).toThrow('End date must be after start date');
        });

        it('should handle valid date range', () => {
          const startTime = '2024-02-18T00:00:00.000Z';
          const endTime = '2024-02-19T00:00:00.000Z';
          const config = {
            type: 'structured' as const,
            keywords: ['test'],
            language: 'en',
            startTime,
            endTime
          };

          const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
          expect(filter.startDate).toEqual(new Date(startTime));
          expect(filter.endDate).toEqual(new Date(endTime));
        });
      });

      describe('operator validation', () => {
        it('should validate operator values', () => {
          const config = {
            type: 'structured' as const,
            keywords: ['test'],
            language: 'en',
            operator: 'INVALID' as any
          };

          expect(() => searchBuilder.buildFilter(config)).toThrow('operator must be either "AND", "OR", or "NOT"');
        });
      });

      it('should validate engagement metrics', () => {
        const config = {
          type: 'structured' as const,
          keywords: ['test'],
          language: 'en',
          minLikes: -1
        };

        expect(() => searchBuilder.buildFilter(config)).toThrow('minLikes must be a non-negative number');
      });
    });

    describe('structured queries', () => {
      it('should handle account filtering', () => {
        const config = {
          type: 'structured' as const,
          accounts: ['@user1', '@user2'],
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
        expect(filter.includeWords).toEqual(['from:user1', 'from:user2']);
        expect(mockMetrics.increment).toHaveBeenCalledWith('search.filters.complex');
      });

      it('should handle mentions filtering', () => {
        const config = {
          type: 'structured' as const,
          mentions: ['@user1', '@user2'],
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
        expect(filter.includeWords).toEqual(['@user1', '@user2']);
      });

      it('should handle keywords with AND operator', () => {
        const config = {
          type: 'structured' as const,
          keywords: ['keyword1', 'keyword2'],
          language: 'en',
          operator: 'AND' as const
        };

        const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
        expect(filter.operator).toBe('AND');
        expect(filter.includeWords).toEqual(['keyword1', 'keyword2']);
      });

      it('should handle keywords with OR operator', () => {
        const config = {
          type: 'structured' as const,
          keywords: ['keyword1', 'keyword2'],
          language: 'en',
          operator: 'OR' as const
        };

        const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
        expect(filter.operator).toBe('OR');
        expect(filter.includeWords).toEqual(['keyword1', 'keyword2']);
      });

      describe('character validation', () => {
        it('should allow valid special characters', () => {
          const validWords = ['#hashtag', '@mention', 'hyphenated-word'];
          validWords.forEach(word => {
            expect(() => searchBuilder.buildSimpleWordSearch(word)).not.toThrow();
          });
        });

        it('should reject invalid special characters', () => {
          const invalidWords = ['test!', 'test$', 'test%'];
          invalidWords.forEach(word => {
            expect(() => searchBuilder.buildSimpleWordSearch(word))
              .toThrow('Search word contains invalid characters');
          });
        });
      });

      it('should handle engagement metrics', () => {
        const config = {
          type: 'structured' as const,
          keywords: ['test'],
          language: 'en',
          minLikes: 100,
          minRetweets: 50,
          minReplies: 10
        };

        const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
        expect(filter.minLikes).toBe(100);
        expect(filter.minRetweets).toBe(50);
        expect(filter.minReplies).toBe(10);
      });

      it('should handle combined filters', () => {
        const startTime = '2024-02-18T00:00:00.000Z';
        const endTime = '2024-02-19T00:00:00.000Z';
        const config = {
          type: 'structured' as const,
          accounts: ['@user1'],
          mentions: ['@user2'],
          keywords: ['keyword1'],
          startTime,
          endTime,
          language: 'en',
          excludeQuotes: true,
          excludeRetweets: true,
          minLikes: 100,
          operator: 'AND' as const
        };

        const filter = searchBuilder.buildFilter(config) as ExtendedTweetFilter;
        
        expect(filter.includeWords).toEqual(['keyword1', 'from:user1', '@user2']);
        expect(filter.startDate).toEqual(new Date(startTime));
        expect(filter.endDate).toEqual(new Date(endTime));
        expect(filter.links).toBe(false); // excludeQuotes is true
        expect(filter.retweets).toBe(false); // excludeRetweets is true
        expect(filter.minLikes).toBe(100);
        expect(filter.operator).toBe('AND');

        expect(mockMetrics.timing).toHaveBeenCalledWith(
          'search.filter_build_time',
          expect.any(Number)
        );
      });

      it('should throw error when no search criteria provided', () => {
        const config = {
          type: 'structured' as const,
          language: 'en'
        };

        expect(() => searchBuilder.buildFilter(config)).toThrow('At least one search criteria');
        expect(mockMetrics.increment).toHaveBeenCalledWith('search.filters.errors');
      });

      describe('error handling', () => {
        it('should track metrics for errors', () => {
          const config = {
            type: 'structured' as const,
            keywords: ['invalid!@#'],
            language: 'en'
          };

          try {
            searchBuilder.buildFilter(config);
          } catch (error) {
            expect(mockMetrics.increment).toHaveBeenCalledWith('search.filters.errors');
          }
        });

        it('should include error context', () => {
          try {
            searchBuilder.buildSimpleWordSearch('invalid!@#');
          } catch (error: any) {
            expect(error.context).toBeDefined();
            expect(error.context.word).toBe('invalid!@#');
            expect(error.context.error).toBe('Search word contains invalid characters');
          }
        });
      });
    });
  });
});