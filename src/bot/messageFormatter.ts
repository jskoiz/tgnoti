import { Tweet, AffiliatedAccount } from '../types/twitter.js';
import { FormattedMessage } from '../types/telegram.js';

export class MessageFormatter {
  private static readonly MAX_LENGTH = 4096;
  private static readonly MAX_CAPTION = 1024;

  private static cleanTweetText(text: string): string {
    // Remove "X (formerly Twitter)" disclaimers, user info, Twitter URLs, long hashes, RT prefixes
    return text
      .replace(/X \(formerly Twitter\)[\s\S]*?on X/g, '')
      .replace(/\w+ \(@\w+\) on X$/gm, '')
      .replace(/(?:https?:\/\/)?(?:(?:twitter|x)\.com|t\.co)\/[^\s]+/gi, '')
      .replace(/\b[A-Za-z0-9]{30,}\b/g, '')
      .replace(/RT @\w+:\s*/, '')
      // Replace excessive spaces/newlines with single spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  static formatTweet(tweet: Tweet, topicId?: string): FormattedMessage {
    const tweetUrl = `https://twitter.com/${tweet.username}/status/${tweet.id}`;

    // Basic stats
    const displayName = this.escapeMarkdownV2(tweet.displayName);
    const username = this.escapeMarkdownV2(tweet.username);
    const followers = tweet.followersCount?.toLocaleString() || '0';
    const following = tweet.followingCount?.toLocaleString() || '0';

    // Clean & escape the tweet text
    const cleaned = this.cleanTweetText(tweet.text);
    const escapedText = this.escapeMarkdownV2(cleaned) || '(no text)';

    // ">>> text" for a pseudo-blockquote
    const quoteLine = `>>> ${escapedText}`;

    // Include a link but do NOT let Telegram show a preview
    const messageText = [
      `🗣️ *${displayName}* @${username}`,
      ` └ ⬇️ ${followers} ⬆️ ${following} [🔗](${tweetUrl})`,
      '',
      quoteLine
    ].join('\n');

    // If topicId is numeric, pass it as message_thread_id
    const threadId = topicId ? parseInt(topicId, 10) : undefined;

    if (tweet.mediaUrl) {
      // Attach photo + caption, still no preview
      return {
        photo: tweet.mediaUrl,
        caption: this.truncate(messageText, this.MAX_CAPTION),
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
        message_thread_id: threadId
      };
    }

    // Otherwise, just text with no preview
    return {
      text: this.truncate(messageText, this.MAX_LENGTH),
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true,
      message_thread_id: threadId
    };
  }

  static formatAffiliateList(username: string, affiliates: AffiliatedAccount[]): FormattedMessage {
    const escapedUsername = this.escapeMarkdownV2(username);
    const header = `🔍 *Affiliated Accounts for @${escapedUsername}*\n`;

    const accountsList = affiliates.length > 0
      ? affiliates.map(account => {
          const verifiedBadge =
            account.verified_type === 'business' ? '🔵'
            : account.verified_type === 'government' ? '🏛️'
            : account.subscription_type?.toLowerCase().includes('premium') ? '✅'
            : '';

          const displayName = this.escapeMarkdownV2(account.displayName);
          const handle = this.escapeMarkdownV2(account.username);

          const badgeUrl = account.affiliation?.badge_url
            ? `  └ 🏷️ ${this.escapeMarkdownV2(account.affiliation.badge_url)}`
            : '';
          const description = account.affiliation?.description
            ? `  └ ℹ️ ${this.escapeMarkdownV2(account.affiliation.description)}`
            : '';

          return [
            `└ ${verifiedBadge} *${displayName}* @${handle}`,
            badgeUrl,
            description
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n\n')
      : '└ No affiliated accounts found';

    const messageText = [header, accountsList].join('\n');

    return {
      text: this.truncate(messageText, this.MAX_LENGTH),
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    };
  }

  static formatSystem(message: string): FormattedMessage {
    const safeMsg = this.escapeMarkdownV2(message);
    const fullMsg = `🤖 *System:* ${safeMsg}`;
    return {
      text: this.truncate(fullMsg, this.MAX_LENGTH),
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    };
  }

  /**
   * Escapes special Markdown V2 characters.
   */
  private static escapeMarkdownV2(text: string): string {
    // This includes: _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/([_*\[\]\(\)~`>#+\-=|{}\.!])/g, '\\$1');
  }

  /**
   * Truncate text to avoid overshooting Telegram’s limits.
   */
  private static truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }
}
