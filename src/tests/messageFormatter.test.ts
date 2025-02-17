import { MessageFormatter } from '../bot/messageFormatter.js';
import { FormattedMessage } from '../types/telegram.js';
import { Tweet } from '../types/twitter.js';

describe('MessageFormatter', () => {
  describe('escapeMarkdown', () => {
    it('should escape special characters', () => {
      const input = 'Hello_world*with[special]characters(test)~`;';
      const expected = 'Hello\\_world\\*with\\[special\\]characters\\(test\\)\\~\\`;';
      expect(MessageFormatter.escapeMarkdown(input)).toBe(expected);
    });

    it('should properly escape hyphens', () => {
      const input = 'text-with-hyphens';
      const expected = 'text\\-with\\-hyphens';
      expect(MessageFormatter.escapeMarkdown(input)).toBe(expected);
    });

    it('should handle multiple backslashes correctly', () => {
      const input = 'path\\to\\file';
      const expected = 'path\\\\to\\\\file';
      expect(MessageFormatter.escapeMarkdown(input)).toBe(expected);
    });

    it('should handle URLs correctly', () => {
      const input = 'https://example.com/path-to.file';
      const expected = 'https\\://example\\.com/path\\-to\\.file';
      expect(MessageFormatter.escapeMarkdown(input)).toBe(expected);
    });
  });

  describe('validateFormattedMessage', () => {
    it('should validate properly escaped message', () => {
      const message: FormattedMessage = {
        text: 'Hello\\_world\\*test',
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      };
      expect(MessageFormatter.validateFormattedMessage(message)).toBe(true);
    });

    it('should reject message with unescaped special characters', () => {
      const message: FormattedMessage = {
        text: 'Hello_world*test',
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      };
      expect(MessageFormatter.validateFormattedMessage(message)).toBe(false);
    });

    it('should handle undefined text', () => {
      const message = {} as FormattedMessage;
      expect(MessageFormatter.validateFormattedMessage(message)).toBe(false);
    });

    it('should validate multi-line messages', () => {
      const message: FormattedMessage = {
        text: 'Line1\\-test\nLine2\\*test\nLine3\\_test',
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      };
      expect(MessageFormatter.validateFormattedMessage(message)).toBe(true);
    });
  });

  describe('formatTweet', () => {
    const mockTweet: Tweet = {
      id: '123456',
      text: 'Hello-world with *special* characters',
      username: 'test-user',
      displayName: 'Test User',
      createdAt: '2025-02-13T20:45:24.000Z',
      followersCount: 1000,
      followingCount: 500
    };

    it('should properly format tweet with special characters', () => {
      const result = MessageFormatter.formatTweet(mockTweet, '377');
      expect(MessageFormatter.validateFormattedMessage(result)).toBe(true);
      expect(result.text).toContain('Hello\\-world with \\*special\\* characters');
    });

    it('should handle URLs in tweet text', () => {
      const tweetWithUrl: Tweet = {
        ...mockTweet,
        text: 'Check this link: https://example.com/test-page'
      };
      const result = MessageFormatter.formatTweet(tweetWithUrl, '377');
      expect(MessageFormatter.validateFormattedMessage(result)).toBe(true);
      expect(result.text).toContain('https\\://example\\.com/test\\-page');
    });

    it('should properly format tweet with media URL', () => {
      const tweetWithMedia: Tweet = {
        ...mockTweet,
        mediaUrl: 'https://example.com/image.jpg'
      };
      const result = MessageFormatter.formatTweet(tweetWithMedia, '377');
      expect(MessageFormatter.validateFormattedMessage(result)).toBe(true);
      expect(result.text).toContain('https\\://example\\.com/image\\.jpg');
    });
  });
});