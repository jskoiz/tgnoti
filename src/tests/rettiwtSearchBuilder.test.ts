import { RettiwtSearchBuilder } from '../twitter/rettiwtSearchBuilder.js';
import { TweetFilter } from 'rettiwt-api';
import { RawSearchQueryConfig, StructuredSearchQueryConfig } from '../types/storage.js';

describe('RettiwtSearchBuilder', () => {
  let searchBuilder: RettiwtSearchBuilder;
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    searchBuilder = new RettiwtSearchBuilder(mockLogger);
    jest.clearAllMocks();
  });

  describe('buildFilter', () => {
    describe('raw queries', () => {
      it('should parse from: queries correctly', () => {
        const config: RawSearchQueryConfig = {
          type: 'raw',
          query: 'from:user1 OR from:user2',
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          fromUsers: ['user1', 'user2'],
          language: 'en',
          links: true,
          top: true
        });
      });

      it('should parse mention queries correctly', () => {
        const config: RawSearchQueryConfig = {
          type: 'raw',
          query: '@user1 OR @user2',
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          mentions: ['user1', 'user2'],
          language: 'en',
          links: true,
          top: true
        });
      });

      it('should handle mixed from: and mention queries', () => {
        const config: RawSearchQueryConfig = {
          type: 'raw',
          query: 'from:user1 OR @user2',
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          fromUsers: ['user1'],
          mentions: ['user2'],
          language: 'en',
          links: true,
          top: true
        });
      });
    });

    describe('structured queries', () => {
      it('should handle account filtering', () => {
        const config: StructuredSearchQueryConfig = {
          type: 'structured',
          accounts: ['@user1', '@user2'],
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          fromUsers: ['user1', 'user2'],
          language: 'en',
          links: true,
          top: true
        });
      });

      it('should handle mentions filtering', () => {
        const config: StructuredSearchQueryConfig = {
          type: 'structured',
          mentions: ['@user1', '@user2'],
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          mentions: ['user1', 'user2'],
          language: 'en',
          links: true,
          top: true
        });
      });

      it('should handle keywords', () => {
        const config: StructuredSearchQueryConfig = {
          type: 'structured',
          keywords: ['keyword1', 'keyword2'],
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          includeWords: ['keyword1', 'keyword2'],
          language: 'en',
          links: true,
          top: true
        });
      });

      it('should handle date filtering', () => {
        const startTime = '2024-02-17T00:00:00Z';
        const config: StructuredSearchQueryConfig = {
          type: 'structured',
          startTime,
          language: 'en'
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          startDate: new Date(startTime),
          language: 'en',
          links: true,
          top: true
        });
      });

      it('should handle combined filters', () => {
        const config: StructuredSearchQueryConfig = {
          type: 'structured',
          accounts: ['@user1'],
          mentions: ['@user2'],
          keywords: ['keyword1'],
          language: 'en',
          startTime: '2024-02-17T00:00:00Z',
          excludeQuotes: true
        };

        const filter = searchBuilder.buildFilter(config);
        expect(filter).toEqual({
          fromUsers: ['user1'],
          mentions: ['user2'],
          includeWords: ['keyword1'],
          language: 'en',
          startDate: new Date('2024-02-17T00:00:00Z'),
          replies: false,
          links: true,
          top: true
        });
      });
    });
  });
});