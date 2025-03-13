import { injectable } from 'inversify';
import { InlineKeyboardButton } from 'node-telegram-bot-api';
import { Tweet } from '../../types/twitter.js';
import { TweetFormatter, TweetMessageConfig } from '../../types/telegram.js';

@injectable()
export class EnhancedMessageFormatter implements TweetFormatter {
  private getUserEmoji(user: Tweet['tweetBy']): string {
    // Alternate between astronaut and ninja based on username hash
    return user?.userName?.length % 2 === 0 ? '🧑‍🚀' : '🥷';
  }

  private formatUserLink(user: Tweet['tweetBy']): string {
    const displayName = user?.displayName || 'Unknown User';
    const userName = user?.userName || '';
    // Format: "Klaus" with link to profile
    return `<a href="https://x.com/${userName}"><b>${displayName}</b></a>`;
  }

  private formatStats(user: Tweet['tweetBy']): string {
    // Format: "79 followers"
    return `<i>${(user?.followersCount || 0).toLocaleString()} followers</i>`;
  }

  private formatMetric(value: number): string {
    return `<code>${value.toLocaleString()}</code>`;
  }

  private getRefreshLink(username: string): string {
    // Returning empty string as per requirements to remove the refresh link
    return '';
  }

  private formatTimestamp(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    const timeAgo = minutes < 60 
      ? `${minutes}m ago`
      : `${Math.floor(minutes / 60)}h ago`;

    // Format: "🗓️ Mar 13, 25 @ 04:42 AM (4h ago)"
    return `🗓️ <i>${date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit'
    })} @ ${date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })} (${timeAgo})</i>`;
  }

  private formatMediaUrls(media?: Tweet['media']): string {
    if (!media?.length) return '';
    
    // Only include video and gif indicators, not photos (as per requirements)
    const videoCount = media.filter(m => m.type === 'video').length;
    const gifCount = media.filter(m => m.type === 'gif').length;
    
    const summaryLines = [];
    
    if (videoCount > 0) {
      summaryLines.push(`🎥 <i>${videoCount}</i>`);
    }
    
    if (gifCount > 0) {
      summaryLines.push(`🎞️ <i>${gifCount}</i>`);
    }
    
    // No photo indicators as per requirements
    
    return summaryLines.join('\n');
  }

  private formatMediaIndicator(media?: Tweet['media']): string {
    if (!media?.length) return '';
    
    // Only include video and gif indicators, not photos (as per requirements)
    const videoCount = media.filter(m => m.type === 'video').length;
    const gifCount = media.filter(m => m.type === 'gif').length;
    
    const summaryLines = [];
    
    if (videoCount > 0) {
      summaryLines.push(`🎥 <i>${videoCount}</i>`);
    }
    
    if (gifCount > 0) {
      summaryLines.push(`🎞️ <i>${gifCount}</i>`);
    }
    
    // No photo indicators as per requirements
    
    return summaryLines.join('\n');
  }

  private formatReplyContext(tweet: Tweet, mediaHandling: 'inline' | 'attachment' = 'inline'): string {
    if (!tweet) return '';
    
    return `<blockquote>
${this.formatHeader(tweet)}
${this.formatTimestamp(tweet.createdAt)}
${this.formatEngagementMetrics(tweet)}

${tweet?.text || ''}
${mediaHandling === 'inline' ? this.formatMediaUrls(tweet.media) : this.formatMediaIndicator(tweet.media)}
</blockquote>`;
  }

  private formatHeader(tweet: Tweet): string {
    const emoji = this.getUserEmoji(tweet.tweetBy);
    const userLink = this.formatUserLink(tweet.tweetBy);
    const stats = this.formatStats(tweet.tweetBy);
    
    // Format: "🥷 Klaus 79 followers"
    return `${emoji} ${userLink} ${stats}`;
  }

  private formatEngagementMetrics(tweet: Tweet): string {
    // Format: "💬 0 🔁 0 ❤️ 0 👁️ 14"
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

  private formatTweetLink(tweet: Tweet): string {
    // Format: "— https://x.com/username/status/id"
    return `—\nhttps://x.com/${tweet.tweetBy?.userName || ''}/status/${tweet?.id || ''}`;
  }

  public formatMessage(config: TweetMessageConfig): string {
    const { tweet, quotedTweet, replyToTweet, translationMessage, mediaHandling = 'inline' } = config;
    
    // Clean up tweet text by removing t.co URLs
    let tweetText = tweet?.text || '';
    // Remove t.co URLs (they typically start with https://t.co/)
    tweetText = tweetText.replace(/https:\/\/t\.co\/\w+/g, '').trim();
    
    const parts = [
      // Header with username, stats, and refresh link
      this.formatHeader(tweet),
      
      // Timestamp
      this.formatTimestamp(tweet.createdAt),
      
      // Engagement metrics
      this.formatEngagementMetrics(tweet),
      
      // Add double spacing before tweet content for better readability
      '',
      '',
      
      // Tweet content (with t.co URLs removed)
      tweetText,
      
      // Media - only include for videos and GIFs, not photos
      mediaHandling === 'inline' ? this.formatMediaUrls(tweet.media) : this.formatMediaIndicator(tweet.media),
      
      // Reply context if applicable
      replyToTweet ? '\nReplying to:' : '',
      replyToTweet ? this.formatReplyContext(replyToTweet, mediaHandling) : '',
      
      // Quoted tweet if applicable
      quotedTweet ? this.formatQuotedTweet(quotedTweet) : '',
      
      // Translation if applicable
      translationMessage || ''
      
      // Tweet link removed as per requirements
    ];

    return parts.filter(Boolean).join('\n');
  }

  public createMessageButtons(tweet: Tweet, config: TweetMessageConfig): InlineKeyboardButton[][] {
    const buttons: InlineKeyboardButton[][] = [];

    // Put both buttons in a single row
    buttons.push([
      // View Tweet button with chain link emoji
      {
        text: '🔗 View Tweet',
        url: `https://x.com/${tweet.tweetBy?.userName || ''}/status/${tweet?.id || ''}`
      },
      // Refresh Stats button with recycle emoji
      {
        text: '♻️ Refresh Stats',
        callback_data: `refresh:${tweet.id}`
      }
    ]);

    return buttons;
  }
}
