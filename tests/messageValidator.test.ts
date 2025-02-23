import 'reflect-metadata';
import { Container } from 'inversify';
import { MessageValidator } from '../src/utils/messageValidator.js';
import { ConsoleLogger } from '../src/utils/logger.js';
import { TYPES } from '../src/types/di.js';
import { Tweet, TweetUser } from '../src/types/twitter.js';

// Create test container
const container = new Container();
container.bind(TYPES.Logger).to(ConsoleLogger).inSingletonScope();
container.bind(TYPES.MessageValidator).to(MessageValidator).inSingletonScope();

// Get validator instance
const validator = container.get<MessageValidator>(TYPES.MessageValidator);

describe('MessageValidator', () => {
  describe('hasExplicitMention', () => {
    it('should detect explicit mentions', () => {
      expect(validator.hasExplicitMention('Hello @TrojanOnSolana!', 'TrojanOnSolana')).toBe(true);
      expect(validator.hasExplicitMention('Hey @trojanonsolana check this', 'TrojanOnSolana')).toBe(true); // Case insensitive
      expect(validator.hasExplicitMention('@TrojanOnSolana at start', 'TrojanOnSolana')).toBe(true);
      expect(validator.hasExplicitMention('End with @TrojanOnSolana', 'TrojanOnSolana')).toBe(true);
    });

    it('should not detect partial mentions', () => {
      expect(validator.hasExplicitMention('Hello TrojanOnSolana', 'TrojanOnSolana')).toBe(false); // Missing @
      expect(validator.hasExplicitMention('Check @TrojanOnSolanaExtra', 'TrojanOnSolana')).toBe(false); // Not word boundary
      expect(validator.hasExplicitMention('No mention here', 'TrojanOnSolana')).toBe(false);
    });

    it('should handle reply tweets correctly', () => {
      // Reply tweets with leading mentions but no explicit mention in content
      expect(validator.hasExplicitMention('@user1 @user2 just saying hello', 'TrojanOnSolana')).toBe(false);
      expect(validator.hasExplicitMention('@user1 @TrojanOnSolana just replying', 'TrojanOnSolana')).toBe(false);
      
      // Reply tweets with explicit mention in content
      expect(validator.hasExplicitMention('@user1 @user2 hey @TrojanOnSolana check this', 'TrojanOnSolana')).toBe(true);
      expect(validator.hasExplicitMention('@user1 great project @TrojanOnSolana', 'TrojanOnSolana')).toBe(true);
    });
  });

  describe('validateTweet', () => {
    const mockUser: TweetUser = {
      userName: 'user1',
      displayName: 'User One',
      followersCount: 1000,
      followingCount: 500,
      verified: false,
      verifiedType: 'none'
    };

    const validTweet: Tweet = {
      id: '123',
      text: 'Hello @TrojanOnSolana!',
      createdAt: '2024-02-11T12:00:00Z',
      tweetBy: mockUser,
      replyCount: 0,
      retweetCount: 0,
      likeCount: 0,
      viewCount: 0
    };

    it('should validate tweets with explicit mentions', () => {
      expect(validator.validateTweet(validTweet)).toBe(true);
    });

    it('should reject tweets without explicit mentions', () => {
      expect(validator.validateTweet({
        ...validTweet,
        text: 'Just saying hello!'
      })).toBe(false);
    });

    it('should handle reply tweets correctly', () => {
      // Reply without explicit mention
      expect(validator.validateTweet({
        ...validTweet,
        text: '@user1 @TrojanOnSolana just replying'
      })).toBe(false);

      // Reply with explicit mention
      expect(validator.validateTweet({
        ...validTweet,
        text: '@user1 check out @TrojanOnSolana project'
      })).toBe(true);
    });

    it('should reject tweets with missing required fields', () => {
      // Test missing text
      const tweetWithoutText = {
        id: '123',
        createdAt: '2024-02-11T12:00:00Z',
        tweetBy: mockUser,
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      } as Tweet;
      expect(validator.validateTweet(tweetWithoutText)).toBe(false);

      // Test missing user
      const tweetWithoutUser = {
        id: '123',
        text: 'Hello @TrojanOnSolana!',
        createdAt: '2024-02-11T12:00:00Z',
        replyCount: 0,
        retweetCount: 0,
        likeCount: 0,
        viewCount: 0
      } as Tweet;
      expect(validator.validateTweet(tweetWithoutUser)).toBe(false);
    });

    it('should reject empty tweets', () => {
      expect(validator.validateTweet({
        ...validTweet,
        text: ''
      })).toBe(false);
    });
  });

  describe('validateMessageLength', () => {
    it('should validate messages within length limit', () => {
      expect(validator.validateMessageLength('Short message', 100)).toBe(true);
    });

    it('should reject messages exceeding length limit', () => {
      expect(validator.validateMessageLength('Long message', 5)).toBe(false);
    });
  });
});