import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { Tweet } from '../types/twitter.js';
import { TYPES } from '../types/di.js';

@injectable()
export class MessageValidator {
  constructor(@inject(TYPES.Logger) private logger: Logger) {}

  hasExplicitMention(text: string, username: string): boolean {
    // Normalize username (remove @ if present)
    const normalizedUsername = username.replace('@', '');
    
    // Check for explicit mention with @ symbol
    const mentionPattern = new RegExp(`@${normalizedUsername}\\b`, 'i');
    
    // Only check the actual tweet text, not any quoted or referenced text
    // Twitter prefixes replies with usernames, so we need to check after any leading @mentions
    const tweetContent = text.replace(/^(@\w+\s+)+/, '');
    
    return mentionPattern.test(tweetContent);
  }

  validateTweet(tweet: Tweet, requireMention: boolean = true, usernames: string[] = ['TrojanOnSolana']): boolean {
    if (!tweet.id || !tweet.text || !tweet.username || !tweet.displayName) {
      this.logger.warn('Invalid tweet structure', new Error('Missing required fields'));
      return false;
    }

    if (tweet.text.length === 0) {
      this.logger.warn('Empty tweet text', new Error(`Tweet ${tweet.id} has no content`));
      return false;
    }

    // Check for any of the required mentions if mention validation is enabled
    if (requireMention) {
      const hasMention = usernames.some(username => this.hasExplicitMention(tweet.text, username));
      if (!hasMention) {
        const usernameList = usernames.map(u => '@' + u).join(' or ');
        this.logger.debug(`Tweet ${tweet.id} does not explicitly mention ${usernameList}`);
        return false;
      }
      this.logger.debug(`Tweet ${tweet.id} contains required mention`);
    }

    return true;
  }

  validateMessageLength(text: string, maxLength: number): boolean {
    if (text.length > maxLength) {
      this.logger.warn('Message too long', new Error(`Message length ${text.length} exceeds max ${maxLength}`));
      return false;
    }

    return true;
  }
}
