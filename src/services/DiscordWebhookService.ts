import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { Tweet } from '../types/twitter.js';
import { TopicConfig } from '../config/unified.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';

export interface DiscordWebhookConfig {
  webhookUrl: string;
  enabled: boolean;
  rateLimitPerMinute: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface DiscordMessage {
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatar_url?: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  footer?: {
    text: string;
    icon_url?: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

@injectable()
export class DiscordWebhookService {
  private messageQueue: Array<{ message: DiscordMessage; retries: number; timestamp: number }> = [];
  private processing = false;
  private lastMessageTime = 0;
  private messageCount = 0;
  private windowStart = Date.now();

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    private config: DiscordWebhookConfig
  ) {
    this.logger.setComponent('DiscordWebhookService');
    this.startProcessing();
  }

  async sendTweetNotification(tweet: Tweet, topic: TopicConfig): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug('Discord webhook disabled, skipping notification');
      return;
    }

    const embed = this.createTweetEmbed(tweet, topic);
    const message: DiscordMessage = {
      embeds: [embed],
      username: `${topic.name} Monitor`,
      avatar_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
    };

    this.queueMessage(message);
    this.metrics.increment('discord.messages.queued');
  }

  private createTweetEmbed(tweet: Tweet, topic: TopicConfig): DiscordEmbed {
    const username = tweet.tweetBy?.userName || 'unknown';
    const displayName = tweet.tweetBy?.displayName || username;
    const tweetUrl = `https://twitter.com/${username}/status/${tweet.id}`;
    
    // Truncate tweet text if too long for Discord
    let description = tweet.text || '';
    if (description.length > 2000) {
      description = description.substring(0, 1997) + '...';
    }

    // Calculate time ago
    const tweetDate = new Date(tweet.createdAt);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - tweetDate.getTime()) / (1000 * 60));
    const timeAgo = diffMinutes < 60 
      ? `${diffMinutes}m ago`
      : `${Math.floor(diffMinutes / 60)}h ago`;

    const embed: DiscordEmbed = {
      title: `New Tweet from @${username}`,
      description: description,
      url: tweetUrl,
      color: 0x1DA1F2, // Twitter blue
      timestamp: tweetDate.toISOString(),
      author: {
        name: `${displayName} (@${username})`,
        url: `https://twitter.com/${username}`,
        icon_url: undefined // Profile image not available in current TweetUser interface
      },
      footer: {
        text: `${topic.name} • ${timeAgo}`,
        icon_url: 'https://abs.twimg.com/icons/apple-touch-icon-192x192.png'
      },
      fields: []
    };

    // Add engagement metrics if available
    if (tweet.likeCount || tweet.retweetCount || tweet.replyCount) {
      const metrics = [];
      if (tweet.likeCount) metrics.push(`❤️ ${tweet.likeCount}`);
      if (tweet.retweetCount) metrics.push(`🔄 ${tweet.retweetCount}`);
      if (tweet.replyCount) metrics.push(`💬 ${tweet.replyCount}`);
      
      embed.fields!.push({
        name: 'Engagement',
        value: metrics.join(' • '),
        inline: true
      });
    }

    // Add quoted tweet info if present
    if (tweet.quotedTweet) {
      const quotedUsername = tweet.quotedTweet.tweetBy?.userName || 'unknown';
      embed.fields!.push({
        name: 'Quoted Tweet',
        value: `@${quotedUsername}: ${tweet.quotedTweet.text?.substring(0, 100) || ''}${tweet.quotedTweet.text && tweet.quotedTweet.text.length > 100 ? '...' : ''}`,
        inline: false
      });
    }

    return embed;
  }

  private queueMessage(message: DiscordMessage): void {
    this.messageQueue.push({
      message,
      retries: 0,
      timestamp: Date.now()
    });

    this.logger.debug(`Queued Discord message, queue length: ${this.messageQueue.length}`);
  }

  private async startProcessing(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.processing) {
      try {
        if (this.messageQueue.length > 0) {
          await this.processNextMessage();
        } else {
          // Wait 1 second before checking queue again
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        this.logger.error('Error in Discord message processing loop:', error instanceof Error ? error : new Error(String(error)));
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on error
      }
    }
  }

  private async processNextMessage(): Promise<void> {
    const queueItem = this.messageQueue.shift();
    if (!queueItem) return;

    // Check rate limiting
    if (!this.canSendMessage()) {
      // Put message back at front of queue
      this.messageQueue.unshift(queueItem);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return;
    }

    try {
      await this.sendToDiscord(queueItem.message);
      this.recordMessageSent();
      this.metrics.increment('discord.messages.sent');
      this.logger.debug('Successfully sent Discord message');
    } catch (error) {
      this.logger.error('Failed to send Discord message:', error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('discord.messages.error');

      // Retry logic
      if (queueItem.retries < this.config.maxRetries) {
        queueItem.retries++;
        this.messageQueue.push(queueItem); // Add to end of queue for retry
        this.logger.debug(`Queued Discord message for retry (attempt ${queueItem.retries}/${this.config.maxRetries})`);
      } else {
        this.logger.error(`Discord message failed after ${this.config.maxRetries} retries, dropping`);
        this.metrics.increment('discord.messages.dropped');
      }
    }
  }

  private canSendMessage(): boolean {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart >= 60000) { // 1 minute window
      this.windowStart = now;
      this.messageCount = 0;
    }

    // Check if we're within rate limit
    if (this.messageCount >= this.config.rateLimitPerMinute) {
      return false;
    }

    // Check minimum delay between messages
    const timeSinceLastMessage = now - this.lastMessageTime;
    const minDelay = Math.ceil(60000 / this.config.rateLimitPerMinute); // Spread messages evenly
    
    return timeSinceLastMessage >= minDelay;
  }

  private recordMessageSent(): void {
    this.lastMessageTime = Date.now();
    this.messageCount++;
  }

  private async sendToDiscord(message: DiscordMessage): Promise<void> {
    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Discord webhook failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Discord rate limiting headers
    const remaining = response.headers.get('x-ratelimit-remaining');
    const resetAfter = response.headers.get('x-ratelimit-reset-after');
    
    if (remaining && parseInt(remaining) <= 1 && resetAfter) {
      const resetMs = parseFloat(resetAfter) * 1000;
      this.logger.warn(`Discord rate limit nearly exceeded, waiting ${resetMs}ms`);
      await new Promise(resolve => setTimeout(resolve, resetMs));
    }
  }

  getQueueLength(): number {
    return this.messageQueue.length;
  }

  getMetrics(): { queued: number; sent: number; errors: number; dropped: number } {
    return {
      queued: this.messageQueue.length,
      sent: this.messageCount,
      errors: 0, // Would need to track this separately
      dropped: 0  // Would need to track this separately
    };
  }

  stop(): void {
    this.processing = false;
  }
}