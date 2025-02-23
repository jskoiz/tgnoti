import { injectable } from 'inversify';
import { InlineKeyboardButton } from 'node-telegram-bot-api';
import { Tweet } from '../types/twitter.js';
import { TweetFormatter, TweetMessageConfig } from '../types/telegram.js';

@injectable()
export class EnhancedMessageFormatter implements TweetFormatter {
  private getUserEmoji(user: Tweet['tweetBy']): string {
    // Alternate between astronaut and ninja based on username hash
    return user?.userName?.length % 2 === 0 ? '🧑‍🚀' : '🥷';
  }

  private formatUserLink(user: Tweet['tweetBy']): string {
    return `<b><a href="https://x.com/${user?.userName || ''}">${user?.displayName || 'Unknown User'}</a></b>`;
  }

  private formatStats(user: Tweet['tweetBy']): string {
    return `(${(user?.followersCount || 0).toLocaleString()} followers)`;
  }

  private formatMetric(value: number): string {
    return `<code>${value.toLocaleString()}</code>`;
  }

  private getRefreshLink(username: string): string {
    return `<a href="refresh:${username}">♽</a>`;
  }

  private formatTimestamp(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    const timeAgo = minutes < 60 
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ago`;

    return `🗓️ ${date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: '2-digit'
    })} @ ${date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })} (${timeAgo})`;
  }

  private formatMediaIndicator(media?: Tweet['media']): string {
    if (!media?.length) return '';
    return `📸 ${media.length}`;
  }

  private formatHeader(tweet: Tweet): string {
    const emoji = this.getUserEmoji(tweet.tweetBy);
    const stats = this.formatStats(tweet.tweetBy);
    
    return `${emoji} ${this.formatUserLink(tweet.tweetBy)} ${stats}`;
  }

  private formatEngagementMetrics(tweet: Tweet): string {
    return [
      `💬 ${this.formatMetric(tweet?.replyCount || 0)}`,
      `🔁 ${this.formatMetric(tweet?.retweetCount || 0)}`,
      `❤️ ${this.formatMetric(tweet?.likeCount || 0)}`,
      `👁️ ${this.formatMetric(tweet?.viewCount || 0)}`
    ].join(' ');
  }

  private formatQuotedTweet(tweet: Tweet): string {
    if (!tweet) return '';
    
    return `<blockquote>
${this.formatHeader(tweet)}
${this.formatTimestamp(tweet.createdAt)}
${this.formatEngagementMetrics(tweet)}

${tweet?.text || ''}
${this.formatMediaIndicator(tweet.media)}
</blockquote>`;
  }

  private formatButtons(showSummarize: boolean): string {
    return showSummarize ? '🪄 Summarize available' : '';
  }

  public formatMessage(config: TweetMessageConfig): string {
    const { tweet, quotedTweet, showSummarizeButton, translationMessage } = config;
    
    const parts = [
      this.formatHeader(tweet),
      this.formatTimestamp(tweet.createdAt),
      // Add two line breaks after the engagement metrics
      `${this.formatEngagementMetrics(tweet)}\n\n`,
      tweet?.text || '',
      this.formatMediaIndicator(tweet.media),
      quotedTweet ? this.formatQuotedTweet(quotedTweet) : '',
      translationMessage || '',
      this.formatButtons(showSummarizeButton || false)
    ];

    return parts.filter(Boolean).join('\n');
  }

  public createMessageButtons(tweet: Tweet, config: TweetMessageConfig): InlineKeyboardButton[][] {
    const buttons: InlineKeyboardButton[][] = [];

    if (config.showSummarizeButton) {
      buttons.push([{
        text: 'Quick Reaction',
        callback_data: `summarize:${tweet.id}`
      }]);
    }

    buttons.push([
      {
        text: 'Delete',
        callback_data: `delete:${tweet.id}`
      },
      {
        text: 'View Tweet',
        url: `https://x.com/${tweet.tweetBy?.userName || ''}/status/${tweet?.id || ''}`
      }
    ]);

    return buttons;
  }
}
