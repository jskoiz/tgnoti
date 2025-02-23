import { DateValidator, DateValidationError } from '../src/utils/dateValidation.js';
import { Logger } from '../src/types/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { Tweet } from '../src/types/twitter.js';

// Mock dependencies
const mockLogger: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

const mockMetrics = {
  metrics: new Map(),
  logger: mockLogger,
  increment: jest.fn(),
  decrement: jest.fn(),
  gauge: jest.fn(),
  timing: jest.fn(),
  setValue: jest.fn(),
  getValue: jest.fn(),
  getMetrics: jest.fn(),
  reset: jest.fn(),
  resetAll: jest.fn()
} as unknown as MetricsManager;

describe('DateValidator', () => {
  let dateValidator: DateValidator;
  let now: Date;

  beforeEach(() => {
    now = new Date('2024-02-19T10:30:00Z');
    dateValidator = new DateValidator(mockLogger, mockMetrics);
    // Mock Date.now() to return a fixed date
    jest.spyOn(Date, 'now').mockImplementation(() => now.getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('validateSystemTime', () => {
    it('should pass for current time', () => {
      expect(() => dateValidator.validateSystemTime()).not.toThrow();
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.success');
    });

    it('should throw for future time', () => {
      const futureDate = new Date(now.getTime() + (8 * 24 * 60 * 60 * 1000)); // 8 days in future
      jest.spyOn(Date, 'now').mockImplementation(() => futureDate.getTime());

      expect(() => dateValidator.validateSystemTime()).toThrow(DateValidationError);
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.errors');
    });
  });

  describe('validateSearchWindow', () => {
    it('should pass for valid search window', () => {
      const startDate = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000)); // 3 days ago
      const endDate = now;

      expect(() => dateValidator.validateSearchWindow(startDate, endDate)).not.toThrow();
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.success');
    });

    it('should throw when start date is after end date', () => {
      const startDate = now;
      const endDate = new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)); // 1 day ago

      expect(() => dateValidator.validateSearchWindow(startDate, endDate))
        .toThrow('Search window start date');
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.errors');
    });

    it('should throw when start date is too far in the past', () => {
      const startDate = new Date(now.getTime() - (8 * 24 * 60 * 60 * 1000)); // 8 days ago
      const endDate = now;

      expect(() => dateValidator.validateSearchWindow(startDate, endDate))
        .toThrow('too far in the past');
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.errors');
    });

    it('should throw when end date is too far in the future', () => {
      const startDate = now;
      const endDate = new Date(now.getTime() + (8 * 24 * 60 * 60 * 1000)); // 8 days in future

      expect(() => dateValidator.validateSearchWindow(startDate, endDate))
        .toThrow('too far in the future');
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.errors');
    });
  });

  describe('validateTweetDate', () => {
    const createTweet = (createdAt: string): Tweet => ({
      id: '123',
      text: 'test tweet',
      createdAt,
      tweetBy: {
        userName: 'testuser',
        displayName: 'Test User',
        followersCount: 100,
        followingCount: 100,
        verified: false,
        verifiedType: 'none'
      },
      replyCount: 0,
      retweetCount: 0,
      likeCount: 0,
      viewCount: 0
    });

    it('should pass for tweet with valid date', () => {
      const tweet = createTweet(new Date(now.getTime() - (1 * 24 * 60 * 60 * 1000)).toISOString());
      expect(dateValidator.validateTweetDate(tweet)).toBe(true);
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.success');
    });

    it('should fail for tweet from future', () => {
      const tweet = createTweet(new Date(now.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString());
      expect(dateValidator.validateTweetDate(tweet)).toBe(false);
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.errors');
    });

    it('should fail for tweet too far in past', () => {
      const tweet = createTweet(new Date(now.getTime() - (8 * 24 * 60 * 60 * 1000)).toISOString());
      expect(dateValidator.validateTweetDate(tweet)).toBe(false);
      expect(mockMetrics.increment).toHaveBeenCalledWith('date.validation.errors');
    });
  });

  describe('setDateBounds', () => {
    it('should update date bounds', () => {
      dateValidator.setDateBounds(5, 3);

      // Test new bounds with search window
      const startDate = new Date(now.getTime() - (4 * 24 * 60 * 60 * 1000)); // 4 days ago
      const endDate = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000)); // 2 days ahead

      expect(() => dateValidator.validateSearchWindow(startDate, endDate)).not.toThrow();
    });

    it('should throw for invalid bounds', () => {
      expect(() => dateValidator.setDateBounds(0, 1))
        .toThrow('Date bounds must be positive numbers');
      expect(() => dateValidator.setDateBounds(1, 0))
        .toThrow('Date bounds must be positive numbers');
      expect(() => dateValidator.setDateBounds(-1, 1))
        .toThrow('Date bounds must be positive numbers');
    });
  });
});