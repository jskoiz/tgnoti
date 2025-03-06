import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { Tweet } from '../types/twitter.js';
import { StorageService } from './StorageService.js';
import { ConfigService } from './ConfigService.js';
import { TopicConfig } from '../config/unified.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { TelegramService } from '../services/TelegramService.js';

@injectable()
export class TweetProcessor {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.StorageService) private storage: StorageService,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TelegramService) private telegram: TelegramService
  ) {
    this.logger.setComponent('TweetProcessor');
  }
  
  async processTweet(tweet: Tweet, topic: TopicConfig): Promise<boolean> {
    const startTime = Date.now();
    const tweetId = tweet.id;
    const topicId = topic.id.toString();
    const username = tweet.tweetBy?.userName || 'unknown';
    
    try {
      // Use debug level for individual tweet processing logs
      this.logger.debug(`Processing tweet ${tweetId} from @${username} for topic ${topic.name} (${topicId})`);
      
      // 1. Check if tweet is already processed (duplicate check)
      if (await this.isDuplicate(tweet, topicId)) {
        return false;
      }
      
      // 2. Validate tweet age
      if (!this.isWithinTimeWindow(tweet, topic.searchWindowMinutes)) {
        const windowMinutes = topic.searchWindowMinutes || 
          this.config.getTwitterConfig().searchWindow.windowMinutes || 60;
        this.logger.debug(`Tweet ${tweetId} from @${username} outside time window of ${windowMinutes} minutes`);
        this.metrics.increment('tweets.age_validation.failed');
        return false;
      } else {
        const windowMinutes = topic.searchWindowMinutes || 
          this.config.getTwitterConfig().searchWindow.windowMinutes || 60;
        const tweetDate = new Date(tweet.createdAt);
        const now = new Date();
        const diffMinutes = (now.getTime() - tweetDate.getTime()) / (1000 * 60);
        this.logger.debug(`Tweet ${tweetId} from @${username} within time window: ${diffMinutes.toFixed(2)} minutes old, window: ${windowMinutes} minutes`);
      }
      
      // 3. Validate tweet content
      if (!this.validateTweet(tweet)) {
        this.logger.debug(`Tweet ${tweetId} from @${username} failed validation`);
        this.metrics.increment('tweets.validation.failed');
        return false;
      }
      
      // 4. Check if tweet matches topic filters
      if (!this.matchesTopicFilters(tweet, topic)) {
        this.logger.debug(`Tweet ${tweetId} from @${username} does not match filters for topic ${topic.name}`);
        this.metrics.increment('tweets.filter.failed');
        return false;
      }
      
      // 5. Format tweet for Telegram
      const formattedMessage = this.formatTweet(tweet);
      
      // 6. Send to Telegram
      await this.telegram.sendMessage(formattedMessage, topic.id);
      
      // 7. Mark as processed
      await this.storage.storeTweet(tweet, topicId);
      
      const processingTime = Date.now() - startTime;
      this.logger.info(`Processed tweet ${tweetId} from @${username} for topic ${topic.name}`);
      this.metrics.timing('tweets.processing.duration', processingTime);
      this.metrics.increment('tweets.processed');
      
      return true;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(`Error processing tweet ${tweetId} from @${username} for topic ${topic.name}:`, error instanceof Error ? error : new Error(String(error)));
      this.metrics.increment('tweets.processing.error');
      this.metrics.timing('tweets.processing.error_duration', processingTime);
      return false;
    }
  }
  
  private async isDuplicate(tweet: Tweet, topicId: string): Promise<boolean> {
    const isDuplicate = await this.storage.hasSeen(tweet.id, topicId);
    
    if (isDuplicate) {
      this.logger.debug(`Tweet ${tweet.id} from @${tweet.tweetBy?.userName || 'unknown'} is a duplicate`);
      this.metrics.increment('tweets.duplicate');
    }
    
    return isDuplicate;
  }
  
  private isWithinTimeWindow(tweet: Tweet, windowMinutes: number = 60): boolean {
    // Ensure we have a valid window minutes value
    const actualWindowMinutes = windowMinutes || 
      this.config.getTwitterConfig().searchWindow.windowMinutes || 60;
      
    const tweetDate = new Date(tweet.createdAt);
    const now = new Date();
    const tweetTimestamp = tweetDate.getTime();
    
    // Check if system date appears to be in the future (2025 or later)
    const systemYearInFuture = now.getFullYear() >= 2025;
    
    let isWithin = false;
    
    if (systemYearInFuture) {
      // System date is in the future (2025 or later)
      // Use the configured window minutes to determine if tweet is within time window
      const windowMs = actualWindowMinutes * 60 * 1000;
      isWithin = (now.getTime() - tweetTimestamp) <= windowMs;
      const diffMinutes = (now.getTime() - tweetTimestamp) / (1000 * 60);
      
      this.logger.debug(`Future system date detected. Tweet age: ${diffMinutes.toFixed(2)} minutes, window: ${actualWindowMinutes} minutes, result: ${isWithin ? 'passed' : 'failed'}`);
    } else {
      // Normal case - system date is reasonable
      const diffMs = now.getTime() - tweetDate.getTime();
      const diffMinutes = diffMs / (1000 * 60);
      isWithin = diffMinutes <= actualWindowMinutes;
      
      if (!isWithin) {
        this.logger.debug(`Tweet age validation failed: ${diffMinutes.toFixed(2)} minutes old, window: ${actualWindowMinutes} minutes`);
      }
    }
    
    
    if (!isWithin) {
      this.metrics.increment('tweets.age_validation.failed');
    }
    
    return isWithin;
  }
  
  private validateTweet(tweet: Tweet): boolean {
    // Basic validation
    if (!tweet.id || !tweet.text || !tweet.createdAt) {
      this.metrics.increment('tweets.validation.missing_fields');
      return false;
    }
    
    // User validation
    if (!tweet.tweetBy || !tweet.tweetBy.userName) {
      this.metrics.increment('tweets.validation.missing_user');
      return false;
    }
    
    return true;
  }
  
  private matchesTopicFilters(tweet: Tweet, topic: TopicConfig): boolean {
    const username = tweet.tweetBy?.userName?.toLowerCase();
    if (!username) return false;
    
    // Check if tweet is from one of the monitored accounts
    if (topic.accounts && topic.accounts.some(account => 
      account.toLowerCase() === username)) {
      this.logger.debug(`Tweet from @${username} matches account filter for topic ${topic.name}`);
      this.metrics.increment('tweets.filter.match.user');
      return true;
    }
    
    // Check if tweet mentions one of the monitored accounts
    if (topic.mentions && tweet.entities?.mentionedUsers) {
      this.logger.debug(`Checking ${tweet.entities.mentionedUsers.length} mentions for topic ${topic.name}`);
      const hasMention = tweet.entities.mentionedUsers.some(mention => 
        topic.mentions!.some(account => 
          account.toLowerCase() === mention.toLowerCase()));
      
      if (hasMention) {
        this.logger.debug(`Tweet from @${username} matches mention filter for topic ${topic.name}`);
        this.metrics.increment('tweets.filter.match.mention');
        return true;
      }
    }
    
    // Check for keywords
    if (topic.keywords && tweet.text) {
      this.logger.debug(`Checking ${topic.keywords.length} keywords for topic ${topic.name}`);
      const tweetText = tweet.text.toLowerCase();
      const hasKeyword = topic.keywords.some(keyword => 
        tweetText.includes(keyword.toLowerCase()));
      
      if (hasKeyword) {
        this.logger.debug(`Tweet from @${username} matches keyword filter for topic ${topic.name}`);
        this.metrics.increment('tweets.filter.match.keyword');
        return true;
      }
    }
    
    this.logger.debug(`Tweet from @${username} does NOT match any filters for topic ${topic.name}`);
    return false;
  }
  
  private formatTweet(tweet: Tweet): string {
    // Basic formatting
    const username = tweet.tweetBy?.userName || 'unknown';
    const displayName = tweet.tweetBy?.displayName || 'Unknown User';
    const text = tweet.text || '';
    const date = new Date(tweet.createdAt).toLocaleString();
    const url = `https://twitter.com/${username}/status/${tweet.id}`;
    
    let formattedTweet = `<b>${displayName}</b> (@${username}) - ${date}\n\n${text}\n\n<a href="${url}">View Tweet</a>`;
    
    // Add media links if present
    if (tweet.media && tweet.media.length > 0) {
      formattedTweet += '\n\nMedia:';
      tweet.media.forEach((media, index) => {
        const icon = media.type === 'photo' ? '📸' : media.type === 'video' ? '🎥' : '🎞️';
        formattedTweet += `\n${icon} <a href="${media.url}">Media ${index + 1}</a>`;
      });
    }
    
    return formattedTweet;
  }
}