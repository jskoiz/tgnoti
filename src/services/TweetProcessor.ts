import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { Tweet } from '../types/twitter.js';
import { StorageService } from './StorageService.js';
import { ConfigService } from './ConfigService.js';
import { TopicConfig } from '../config/unified.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { ITelegramMessageQueue, TweetFormatter, TweetMessageConfig, FormattedMessage, TweetMetadata } from '../types/telegram.js';
import { DeliveryManager } from './DeliveryManager.js';

// Default minimum number of substantive words required for a tweet to be considered substantive
const DEFAULT_MIN_SUBSTANTIVE_WORDS = 4;

@injectable()
export class TweetProcessor {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.StorageService) private storage: StorageService,
    @inject(TYPES.ConfigService) private config: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.TelegramMessageQueue) private telegramQueue: ITelegramMessageQueue,
    @inject(TYPES.TweetFormatter) private tweetFormatter: TweetFormatter,
    @inject(TYPES.DeliveryManager) private deliveryManager: DeliveryManager
  ) {
    this.logger.setComponent('TweetProcessor');
  }
  
  async processTweet(tweet: Tweet, topic: TopicConfig): Promise<boolean> {
    const startTime = Date.now();
    const tweetId = tweet.id;
    const topicId = topic.id.toString();
    const username = tweet.tweetBy?.userName || 'unknown';
    
    try {
      // Use info level for mass tracking to see what's happening
      if (topic.id === 33763) {
        this.logger.info(`[MASS TRACKING] Processing tweet ${tweetId} from @${username} (${tweet.createdAt})`);
      } else {
        this.logger.debug(`[TWEET PROCESSING START] Processing tweet ${tweetId} from @${username} for topic ${topic.name} (${topicId})`);
      }
      
      // 1. Check if tweet is already processed (duplicate check)
      if (await this.isDuplicate(tweet, topicId)) {
        if (topic.id === 33763) {
          this.logger.info(`[MASS TRACKING] REJECTED - Tweet ${tweetId} from @${username} is a duplicate`);
        } else {
          this.logger.debug(`[TWEET PROCESSING REJECTED] Tweet ${tweetId} from @${username} is a duplicate`);
        }
        return false;
      }
      
      // 2. Validate tweet age
      if (!this.isWithinTimeWindow(tweet, topic.searchWindowMinutes)) {
        const windowMinutes = topic.searchWindowMinutes ||
          this.config.getTwitterConfig().searchWindow.windowMinutes || 60;
        const tweetDate = new Date(tweet.createdAt);
        const now = new Date();
        const diffMinutes = (now.getTime() - tweetDate.getTime()) / (1000 * 60);
        
        if (topic.id === 33763) {
          this.logger.info(`[MASS TRACKING] REJECTED - Tweet ${tweetId} from @${username} outside time window: ${diffMinutes.toFixed(2)} minutes old, window: ${windowMinutes} minutes`);
        } else {
          this.logger.debug(`Tweet ${tweetId} from @${username} outside time window of ${windowMinutes} minutes`);
        }
        this.metrics.increment('tweets.age_validation.failed');
        return false;
      } else {
        const windowMinutes = topic.searchWindowMinutes ||
          this.config.getTwitterConfig().searchWindow.windowMinutes || 60;
        const tweetDate = new Date(tweet.createdAt);
        const now = new Date();
        const diffMinutes = (now.getTime() - tweetDate.getTime()) / (1000 * 60);
        
        if (topic.id === 33763) {
          this.logger.info(`[MASS TRACKING] PASSED - Tweet ${tweetId} from @${username} within time window: ${diffMinutes.toFixed(2)} minutes old, window: ${windowMinutes} minutes`);
        } else {
          this.logger.debug(`Tweet ${tweetId} from @${username} within time window: ${diffMinutes.toFixed(2)} minutes old, window: ${windowMinutes} minutes`);
        }
      }
      
      // 3. Validate tweet content
      if (!this.validateTweet(tweet)) {
        if (topic.id === 33763) {
          this.logger.info(`[MASS TRACKING] REJECTED - Tweet ${tweetId} from @${username} failed validation`);
        } else {
          this.logger.debug(`Tweet ${tweetId} from @${username} failed validation`);
        }
        this.metrics.increment('tweets.validation.failed');
        return false;
      }
      
      // 4. Check if tweet matches topic filters
      if (!this.matchesTopicFilters(tweet, topic)) {
        if (topic.id === 33763) {
          this.logger.info(`[MASS TRACKING] REJECTED - Tweet ${tweetId} from @${username} does not match filters for topic ${topic.name}`);
        } else {
          this.logger.debug(`Tweet ${tweetId} from @${username} does not match filters for topic ${topic.name}`);
        }
        this.metrics.increment('tweets.filter.failed');
        return false;
      }
      
      // 5. Check if this is MASS_TRACKING topic - use DeliveryManager for enhanced delivery
      if (topic.id === 33763) { // MASS_TRACKING topic ID
        this.logger.info(`Sending MASS_TRACKING tweet ${tweetId} from @${username} via DeliveryManager`);
        try {
          await this.deliveryManager.sendTweetNotification(tweet, topic);
          this.logger.info(`Successfully sent MASS_TRACKING tweet ${tweetId} from @${username} via DeliveryManager`);
          this.metrics.increment('tweets.delivery_manager.sent');
        } catch (deliveryError) {
          this.logger.error(`Failed to send MASS_TRACKING tweet ${tweetId} via DeliveryManager:`, deliveryError instanceof Error ? deliveryError : new Error(String(deliveryError)));
          this.metrics.increment('tweets.delivery_manager.error');
          throw deliveryError;
        }
      } else {
        // 6. For other topics, format tweet for Telegram and use traditional queue system
        const formattedMessage = this.formatTweet(tweet);
        
        // 7. Send to Telegram using the proper queue system
        this.logger.info(`Queueing tweet ${tweetId} from @${username} to Telegram topic ${topic.name} (${topic.id})`);
        try {
        const telegramConfig = this.config.getTelegramConfig();
        
        // Create tweet metadata for the queue
        const tweetMetadata: TweetMetadata = {
          tweet: tweet,
          matchedTopic: topic.name,
          type: 'original' // Default type, could be enhanced to detect replies/quotes
        };
        
        // Prepare message content and options based on formatted message type
        let messageContent: string;
        let messageOptions: any = {
          parse_mode: telegramConfig.messageOptions.parse_mode,
          disable_web_page_preview: telegramConfig.messageOptions.disable_web_page_preview,
          disable_notification: false,
          protect_content: false
        };
        
        if (typeof formattedMessage === 'string') {
          messageContent = formattedMessage;
        } else {
          // Handle FormattedMessage object
          messageContent = formattedMessage.text || formattedMessage.caption || '';
          if (formattedMessage.reply_markup) {
            messageOptions.reply_markup = formattedMessage.reply_markup;
          }
          if (formattedMessage.parse_mode) {
            messageOptions.parse_mode = formattedMessage.parse_mode;
          }
          if (formattedMessage.disable_web_page_preview !== undefined) {
            messageOptions.disable_web_page_preview = formattedMessage.disable_web_page_preview;
          }
          
          // Handle photo messages by including photo URL in text content
          if (formattedMessage.photo) {
            messageContent = `📸 ${messageContent}\n\nPhoto: ${formattedMessage.photo}`;
          }
        }
        
        // Queue the message with proper rate limiting
        const messageId = await this.telegramQueue.queueMessage({
          chatId: parseInt(telegramConfig.api.groupId),
          threadId: topic.id,
          tweetId: tweetId,
          content: messageContent,
          messageOptions: messageOptions,
          tweetMetadata: tweetMetadata,
          priority: 1 // Normal priority
        });
        
        this.logger.info(`Successfully queued tweet ${tweetId} from @${username} to Telegram topic ${topic.name} (${topic.id}), message ID: ${messageId}`);
        this.metrics.increment('telegram.messages.queued');
        
        // Note: markSeen is now handled by the TelegramMessageQueue after successful delivery
        // But we still need to store the tweet in our database
        } catch (sendError) {
          this.logger.error(`Failed to queue tweet ${tweetId} for Telegram:`, sendError instanceof Error ? sendError : new Error(String(sendError)));
          this.metrics.increment('telegram.messages.error');
          throw sendError;
        }
      }
      
      // 8. Mark as processed in our database (separate from delivery tracking)
      this.logger.info(`Storing tweet ${tweetId} in database for topic ${topicId}`);
      await this.storage.storeTweet(tweet, topicId);
      
      const processingTime = Date.now() - startTime;
      this.logger.debug(`[TWEET PROCESSING SUCCESS] Processed tweet ${tweetId} from @${username} for topic ${topic.name} in ${processingTime}ms`);
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
      this.logger.debug(`Tweet ${tweet.id} from @${tweet.tweetBy?.userName || 'unknown'} is a duplicate for topic ${topicId}`);
      this.metrics.increment('tweets.duplicate');
    } else {
      this.logger.debug(`Tweet ${tweet.id} from @${tweet.tweetBy?.userName || 'unknown'} is NOT a duplicate for topic ${topicId}`);
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
    
    this.logger.debug(`Time window check for tweet ${tweet.id} from @${tweet.tweetBy?.userName || 'unknown'}: Tweet date: ${tweetDate.toISOString()}, System date: ${now.toISOString()}, Window: ${actualWindowMinutes} minutes`);
    
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
  
  /**
   * Determines if a tweet has enough substantive content to be worth forwarding
   * Filters out short replies with minimal content
   * @param tweet The tweet to analyze
   * @param minWords Optional minimum word count, defaults to environment variable or constant
   * @returns true if the tweet has substantive content, false otherwise
   */
  private isSubstantiveTweet(tweet: Tweet, minWords?: number): boolean {
    // Get the minimum word count from parameter, environment, or use default
    const minSubstantiveWords = minWords || (process.env.MIN_SUBSTANTIVE_WORDS 
      ? parseInt(process.env.MIN_SUBSTANTIVE_WORDS, 10) 
      : DEFAULT_MIN_SUBSTANTIVE_WORDS);
    
    // Get the tweet text
    let text = tweet.text || '';
    
    // Remove all @mentions
    text = text.replace(/@\w+/g, '');
    
    // Remove URLs
    text = text.replace(/https?:\/\/\S+/g, '');
    
    // Split into words and filter out empty strings
    const words = text.split(/\s+/).filter(word => word.length > 0);
    
    // Count substantive words
    const wordCount = words.length;
    
    // Log for debugging
    this.logger.debug(`Tweet ${tweet.id} has ${wordCount} substantive words: "${words.join(' ')}"`);
    
    // Return true if the tweet has more than the minimum number of substantive words
    return wordCount >= minSubstantiveWords;
  }

  private matchesTopicFilters(tweet: Tweet, topic: TopicConfig): boolean {
    const username = tweet.tweetBy?.userName?.toLowerCase();
    if (!username) {
      if (topic.id === 33763) {
        this.logger.info(`[MASS TRACKING] FILTER - Tweet ${tweet.id} has no username`);
      }
      return false;
    }

    if (topic.id === 33763) {
      this.logger.info(`[MASS TRACKING] FILTER - Checking tweet ${tweet.id} from @${username} against ${topic.accounts?.length || 0} monitored accounts`);
    } else {
      this.logger.debug(`Checking if tweet ${tweet.id} from @${username} matches filters for topic ${topic.name} (${topic.id})`);
      if (topic.accounts) {
        this.logger.debug(`Topic ${topic.name} has ${topic.accounts.length} accounts: ${topic.accounts.join(', ')}`);
      }
    }
    
    // Check if tweet is from one of the monitored accounts
    if (topic.accounts && topic.accounts.some(account =>
      account.toLowerCase() === username)) {
      
      // For KOL monitoring topic (ID: 6531), apply special filtering
      if (topic.id === 6531) {
        // Check if this is a reply - either by replyToTweet property or by starting with @mention
        const hasReplyProperty = !!tweet.replyToTweet;
        const startsWithMention = tweet.text.trim().match(/^@\w+/);
        const isReply = hasReplyProperty || startsWithMention;
        
        if (isReply) {
          // For replies, require at least 6 substantive words
          if (!this.isSubstantiveTweet(tweet, 6)) {
            this.logger.debug(`KOL tweet from @${username} filtered out: reply with insufficient content`);
            this.metrics.increment('tweets.filter.kol_reply_insufficient');
            return false;
          }
          this.logger.debug(`KOL reply from @${username} has sufficient content (>6 words)`);
        } else {
          this.logger.debug(`KOL tweet from @${username} is not a reply, including`);
        }
      }
      
      if (topic.id === 33763) {
        this.logger.info(`[MASS TRACKING] FILTER - Tweet from @${username} MATCHES account filter`);
      } else {
        this.logger.debug(`Tweet from @${username} matches account filter for topic ${topic.name}`);
        this.logger.debug(`Tweet from @${username} MATCHES account filter for topic ${topic.name}`);
      }
      this.metrics.increment('tweets.filter.match.user');
      return true;
    } else {
      if (topic.id === 33763) {
        this.logger.info(`[MASS TRACKING] FILTER - Tweet from @${username} NOT in monitored accounts list`);
      }
    }
    
    // Check if tweet mentions one of the monitored accounts
    if (topic.mentions && tweet.entities?.mentionedUsers) {
      this.logger.debug(`Checking ${tweet.entities.mentionedUsers.length} mentions for topic ${topic.name}`);
      this.logger.debug(`Checking ${tweet.entities.mentionedUsers.length} mentions for topic ${topic.name}: ${tweet.entities.mentionedUsers.join(', ')}`);
      const hasMention = tweet.entities.mentionedUsers.some(mention => 
        topic.mentions!.some(account => 
          account.toLowerCase() === mention.toLowerCase()));
      
      if (hasMention) {
        // For COMPETITOR_MENTIONS topic (ID: 12110), check if the tweet has substantive content
        if (topic.id === 12110) {
          if (!this.isSubstantiveTweet(tweet)) {
            this.logger.debug(`Tweet from @${username} filtered out due to insufficient content`);
            this.metrics.increment('tweets.filter.insufficient_content');
            return false;
          }
          this.logger.debug(`Tweet from @${username} has sufficient content for COMPETITOR_MENTIONS topic`);
        }
        
        this.logger.debug(`Tweet from @${username} matches mention filter for topic ${topic.name}`);
        this.logger.debug(`Tweet from @${username} MATCHES mention filter for topic ${topic.name}`);
        this.metrics.increment('tweets.filter.match.mention');
        return true;
      }
    }
    
    // Check for keywords
    if (topic.keywords && tweet.text) {
      this.logger.debug(`Checking ${topic.keywords.length} keywords for topic ${topic.name}`);
      this.logger.debug(`Checking ${topic.keywords.length} keywords for topic ${topic.name}: ${topic.keywords.join(', ')}`);
      const tweetText = tweet.text.toLowerCase();
      const hasKeyword = topic.keywords.some(keyword => 
        tweetText.includes(keyword.toLowerCase()));
      
      if (hasKeyword) {
        this.logger.debug(`Tweet from @${username} matches keyword filter for topic ${topic.name}`);
        this.logger.debug(`Tweet from @${username} MATCHES keyword filter for topic ${topic.name}`);
        this.metrics.increment('tweets.filter.match.keyword');
        return true;
      }
    }
    
    this.logger.debug(`Tweet from @${username} does NOT match any filters for topic ${topic.name}`);
    return false;
  }
  
  private formatTweet(tweet: Tweet): string | FormattedMessage {
    // Check if the tweet has photo media
    const hasPhoto = tweet.media?.some(m => m.type === 'photo');
    
    if (hasPhoto && tweet.media && tweet.media.length > 0) {
      // Find the first photo
      const photoUrl = tweet.media.find(m => m.type === 'photo')?.url;
      
      if (photoUrl) {
        // Use the EnhancedMessageFormatter to format the tweet as a caption
        const config: TweetMessageConfig = {
          tweet,
          quotedTweet: tweet.quotedTweet,
          replyToTweet: tweet.replyToTweet,
          mediaHandling: 'attachment' // Don't include media links in the caption
        };
        
        const caption = this.tweetFormatter.formatMessage(config);
        
        // Create buttons for the message
        const buttons = this.tweetFormatter.createMessageButtons(tweet, config);
        
        // Return a FormattedMessage object with photo, caption, and buttons
        return {
          photo: photoUrl,
          caption: caption,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: buttons
          }
        };
      }
    }
    
    // If no photo or couldn't find photo URL, format as regular text message
    const config: TweetMessageConfig = {
      tweet,
      quotedTweet: tweet.quotedTweet,
      replyToTweet: tweet.replyToTweet,
      mediaHandling: 'inline'
    };
    
    // Create buttons for the message
    const buttons = this.tweetFormatter.createMessageButtons(tweet, config);
    
    // Format the message text
    const messageText = this.tweetFormatter.formatMessage(config);
    
    // Return a FormattedMessage object with text and buttons
    return {
      text: messageText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: buttons
      }
    };
  }
}
