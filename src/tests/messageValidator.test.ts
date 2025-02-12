import 'reflect-metadata';
import { Container } from 'inversify';
import { MessageValidator } from '../utils/messageValidator.js';
import { ConsoleLogger } from '../utils/logger.js';
import { TYPES } from '../types/di.js';

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
    const validTweet = {
      id: '123',
      text: 'Hello @TrojanOnSolana!',
      username: 'user1',
      displayName: 'User One',
      createdAt: '2024-02-11T12:00:00Z'
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
      expect(validator.validateTweet({
        ...validTweet,
        text: undefined as any
      })).toBe(false);

      expect(validator.validateTweet({
        ...validTweet,
        username: undefined as any
      })).toBe(false);
    });

    it('should reject empty tweets', () => {
      expect(validator.validateTweet({
        ...validTweet,
        text: ''
      })).toBe(false);
    });
  });
});
