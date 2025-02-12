import { Tweet, AffiliatedAccount } from '../types/twitter.js';
import { FormattedMessage } from '../types/telegram.js';

export class MessageFormatter {
  private static readonly MAX_LENGTH = 4096;
  private static readonly MAX_CAPTION = 1024;

  private static escapeUrl(url: string): string {
    // Escape dots and other special characters in URLs
    return url.replace(/([._![\]()~>#+=|{}.!-])/g, '\\$1');
  }

  private static cleanTweetText(text: string): string {
    // Remove the "X (formerly Twitter)" section, user info, URLs, and any long hashes/codes
    return text
              .replace(/X \(formerly Twitter\)[\s\S]*?on X/g, '')  // Full format
              .replace(/\w+ \(@\w+\) on X$/gm, '')  // Short format (@username) on X
              .replace(/https:\/\/twitter\.com\/[^\s]+/g, '')
              .replace(/https:\/\/t\.co\/\w+/g, '')
              .replace(/\b[A-Za-z0-9]{30,}\b/g, '')  // Remove long alphanumeric strings (likely hashes or encoded data)
              .trim();
  }

  static formatTweet(tweet: Tweet, topicId?: string): FormattedMessage {
    // Using tree-style layout as defined in techContext.md
    const messageText = [
      `🗣️ *${this.escapeMarkdown(tweet.displayName)}* @${this.escapeUsername(tweet.username)}`,
      ` └ ⬇️ ${tweet.followersCount?.toLocaleString() || '0'} ⬆️ ${tweet.followingCount?.toLocaleString() || '0'}`,
      '',
      this.formatTweetText(this.cleanTweetText(tweet.text)),
      '',
      this.escapeUrl(`https://twitter.com/${tweet.username}/status/${tweet.id}`)
    ].join('\n');

    const threadId = topicId ? parseInt(topicId) : undefined;

    if (tweet.mediaUrl) {
      return {
        photo: tweet.mediaUrl,
        caption: this.truncate(messageText, this.MAX_CAPTION),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        message_thread_id: threadId
      };
    }

    return {
      text: this.truncate(messageText, this.MAX_LENGTH),
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      message_thread_id: threadId
    };
  }

  static formatAffiliateList(username: string, affiliates: AffiliatedAccount[]): FormattedMessage {
    const header = `🔍 *Affiliated Accounts for @${this.escapeUsername(username)}*\n`;
    
    console.log('Formatting affiliates:', JSON.stringify(affiliates, null, 2));
    
    const accountsList = affiliates.length > 0
      ? affiliates.map(account => {
          const verifiedBadge = account.verified_type === 'business' ? '🔵' : 
                               account.verified_type === 'government' ? '🏛️' : 
                               account.subscription_type?.toLowerCase().includes('premium') ? '✅' : '';
          
          return [
            `└ ${verifiedBadge} *${this.escapeMarkdown(account.displayName)}* @${this.escapeUsername(account.username)}`,
            account.affiliation?.badge_url ? `  └ 🏷️ ${this.escapeUrl(account.affiliation.badge_url)}` : '',
            account.affiliation?.description ? `  └ i️ ${this.escapeMarkdown(account.affiliation.description)}` : ''
          ].filter(line => line).join('\n');
        }).join('\n\n')
      : '└ No affiliated accounts found';

    const messageText = [
      header,
      accountsList
    ].join('\n');

    return {
      text: this.truncate(messageText, this.MAX_LENGTH),
      parse_mode: 'MarkdownV2'
    };
  }

  static formatSystem(message: string): FormattedMessage {
    return {
      text: this.truncate(`🤖 *System:* ${this.escapeMarkdown(message)}`, this.MAX_LENGTH),
      parse_mode: 'MarkdownV2'
    };
  }

  private static formatTweetText(text: string): string {
    // Format tweet text with blockquote style
    return text
      .split('\n')
      .map(line => `\\> ${this.escapeMarkdown(line)}`)
      .join('\n');
  }

  private static escapeUsername(username: string): string {
    // Usernames need special handling to ensure underscores are properly escaped
    return username.replace(/[_]/g, '\\_');
  }

  private static escapeMarkdown(text: string): string {
    // Escape special Markdown characters
    return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }

  private static truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}