import { injectable } from 'inversify';

/**
 * Interface for tweet-like objects that contain username information
 */
interface TweetLike {
  tweetBy: { userName: string };
  entities?: { mentionedUsers?: string[] };
}

@injectable()
export class UsernameHandler {
  private readonly USERNAME_REGEX = /^@?[a-zA-Z0-9_]{1,15}$/;

  /**
   * Normalize a username by:
   * - Removing @ prefix if present
   * - Converting to lowercase
   * - Trimming whitespace
   */
  normalizeUsername(username: string): string {
    return username.replace(/^@/, '').toLowerCase().trim();
  }

  /**
   * Check if a username matches, handling @ prefix and case sensitivity
   */
  isUsernameMatch(username1: string, username2: string): boolean {
    return this.normalizeUsername(username1) === this.normalizeUsername(username2);
  }

  /**
   * Check if a tweet is from or mentions a specific username
   */
  isTweetRelevantToUser(tweet: TweetLike, username: string): boolean {
    const normalizedUsername = this.normalizeUsername(username);
    
    // Check if tweet is from the user
    if (this.isUsernameMatch(tweet.tweetBy.userName, normalizedUsername)) {
      return true;
    }

    // Check if tweet mentions the user
    if (tweet.entities?.mentionedUsers?.some(mention => 
      this.isUsernameMatch(mention, normalizedUsername)
    )) {
      return true;
    }

    return false;
  }

  /**
   * Validate a username format
   */
  validateUsername(username: string): boolean {
    if (!username || typeof username !== 'string') {
      return false;
    }
    
    const normalized = this.normalizeUsername(username);
    return this.USERNAME_REGEX.test(normalized);
  }
}
