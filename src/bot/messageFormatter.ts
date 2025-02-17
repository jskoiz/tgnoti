import { FormattedMessage } from '../types/telegram.js';
import { AffiliateChange } from '../types/affiliate.js';
import { Tweet } from '../types/twitter.js';

export class MessageFormatter {
  private static readonly SPECIAL_CHARS = /[<>&]/g;
  private static readonly BACKSLASH = /\\/g;
  private static readonly URL_PATTERN = /(https?:\/\/[^\s]+)/g;
  private static readonly ZERO_WIDTH_SPACE = '\u200B';

  static escapeMarkdown(text: string): string {
    if (!text) {
      return '';
    }

    // Extract URLs to handle them separately
    const urls = text.match(this.URL_PATTERN) || [];
    let escaped = text;

    // Replace URLs with placeholders
    urls.forEach((url, index) => {
      const placeholder = `__URL_PLACEHOLDER_${index}__`;
      escaped = escaped.replace(url, placeholder);
    });

    // Escape special characters
    escaped = escaped.replace(this.SPECIAL_CHARS, match => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[match] || match));

    // Restore URLs with proper escaping
    urls.forEach((url, index) => {
      const placeholder = `__URL_PLACEHOLDER_${index}__`;
      const escapedUrl = url.replace(this.SPECIAL_CHARS, '\\$&');
      escaped = escaped.replace(placeholder, escapedUrl);
    });

    return escaped;
  }

  static validateFormattedMessage(message: FormattedMessage): boolean {
    try {
      if (!message?.text) {
        return false;
      }

      // Extract URLs to validate them separately
      const urls = message.text.match(this.URL_PATTERN) || [];
      let textToValidate = message.text;

      // Temporarily replace URLs with placeholders
      urls.forEach((url, index) => {
        const placeholder = `__URL_PLACEHOLDER_${index}__`;
        textToValidate = textToValidate.replace(url, placeholder);
      });

      // Validate main text
      const lines = textToValidate.split('\n');
      for (let line of lines) {
        // Skip URL placeholders
        if (!line.includes('__URL_PLACEHOLDER_')) {
          let prev = '';
          for (const char of line) {
            if (this.SPECIAL_CHARS.test(char) && prev !== '\\') {
              return false;
            }
            prev = char;
          }
        }
      }

      // Validate URLs separately
      return urls.every(url => this.validateUrl(url));

    } catch (error) {
      return false;
    }
  }

  private static validateUrl(url: string): boolean {
    try {
      const specialChars = url.match(this.SPECIAL_CHARS) || [];
      return specialChars.every((char, index) => {
        const prevChar = url[url.indexOf(char) - 1];
        return prevChar === '\\';
      });
    } catch (error) {
      return false;
    }
  }

  static formatAffiliateList(orgUsername: string, affiliates: string[]): FormattedMessage {
    const escapedUsername = this.escapeMarkdown(orgUsername);
    const escapedAffiliates = affiliates
      .map(a => `@${this.ZERO_WIDTH_SPACE}${this.escapeMarkdown(a)}`)
      .join(', ');

    return {
      text: [
        `👥 <b>Affiliates for @${this.ZERO_WIDTH_SPACE}${escapedUsername}</b>`,
        '',
        affiliates.length > 0 ? escapedAffiliates : 'No affiliates found',
      ].join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
  }

  static formatAffiliateChange(orgUsername: string, change: AffiliateChange): FormattedMessage {
    const escapedUsername = this.escapeMarkdown(orgUsername);
    const addedList = change.added
      .map(a => `@${this.ZERO_WIDTH_SPACE}${this.escapeMarkdown(a)}`)
      .join(', ');
    const removedList = change.removed
      .map(a => `@${this.ZERO_WIDTH_SPACE}${this.escapeMarkdown(a)}`)
      .join(', ');
    
    const sections = [
      `🔄 <b>Affiliate Changes for @${this.ZERO_WIDTH_SPACE}${escapedUsername}</b>`,
      ''
    ];

    if (change.added.length > 0) {
      sections.push('<b>Added:</b>');
      sections.push(addedList);
      sections.push('');
    }

    if (change.removed.length > 0) {
      sections.push('<b>Removed:</b>');
      sections.push(removedList);
      sections.push('');
    }

    sections.push(`<b>Time:</b> ${change.timestamp.toLocaleString()}`);

    return {
      text: sections.join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
  }

  static formatAffiliateStatus(monitoredOrgs: string[]): FormattedMessage {
    const escapedOrgs = monitoredOrgs
      .map(org => `@${this.ZERO_WIDTH_SPACE}${this.escapeMarkdown(org)}`)
      .join(', ');

    return {
      text: [
        '📊 <b>Affiliate Tracking Status</b>',
        '',
        '<b>Monitored Organizations:</b>',
        monitoredOrgs.length > 0 ? escapedOrgs : 'No organizations currently monitored',
        '',
        '<b>Last Check:</b> ' + new Date().toLocaleString(),
      ].join('\n'),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
  }

  static formatError(message: string): FormattedMessage {
    return {
      text: `❌ ${this.escapeMarkdown(message)}`,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
  }

  static formatTweet(tweet: Tweet, topicId: string): FormattedMessage {
    const escapedName = this.escapeMarkdown(tweet.displayName);
    const escapedUsername = this.escapeMarkdown(tweet.username);
    const escapedCreatedAt = this.escapeMarkdown(tweet.createdAt);
    
    // Escape the entire tweet text including URLs
    const escapedText = this.escapeMarkdown(tweet.text);

    // Escape the tweet URL
    const tweetUrl = this.escapeMarkdown(
      `https://twitter.com/${tweet.username}/status/${tweet.id}`
    );

    const lines = [
      `🗣️ <b>${escapedName}</b>`,
      ` ├ @${this.ZERO_WIDTH_SPACE}${escapedUsername} - <b>${escapedCreatedAt}</b>`,
      ` └ <b>Following:</b> ${tweet.followingCount || 0} - <b>Followers:</b> ${tweet.followersCount || 0}`,
      '',
      ...escapedText.split('\n').map(line => `&gt; ${line}`),
      '',
      `<a href="${tweetUrl}">${tweetUrl}</a>`
    ];

    // Add image if present
    if (tweet.mediaUrl) {
      lines.push(this.escapeMarkdown(tweet.mediaUrl));
    }

    return {
      text: lines.join('\n'),
      parse_mode: 'HTML',
      message_thread_id: parseInt(topicId),
      disable_web_page_preview: true
    };
  }
}
