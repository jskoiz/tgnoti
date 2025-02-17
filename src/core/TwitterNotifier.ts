import { injectable, inject } from 'inversify';
import { Storage } from '../storage/storage.js';
import { SearchBuilder } from '../twitter/searchBuilder.js';
import { MessageFormatter } from '../bot/messageFormatter.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { Logger } from '../types/logger.js';
import { FormattedMessage } from '../types/telegram.js';
import { SearchQueryConfig } from '../types/storage.js';
import { SearchConfig, Tweet } from '../types/twitter.js';
import { Environment } from '../config/environment.js';
import { MessageValidator } from '../utils/messageValidator.js';
import { TYPES } from '../types/di.js';
import path from 'path';

@injectable()
export class TwitterNotifier {
  private isRunning = false;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MessageValidator) private messageValidator: MessageValidator,
    @inject(TYPES.TelegramBot) private telegram: TelegramBot,
    @inject(TYPES.TwitterClient) private twitter: TwitterClient,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.SearchBuilder) private searchBuilder: SearchBuilder
  ) {}

  async initialize(): Promise<void> {
    try {
      // 1. Validate environment
      this.logger.info('Validating environment...');
      this.environment.validateEnvironment();

      // 2. Load configuration
      this.logger.info('Loading configuration...');
      const config = await this.storage.getConfig();

      // 3. Verify storage
      this.logger.info('Verifying storage...');
      await this.storage.verify();

      // 4. Initialize Telegram bot
      this.logger.info('Initializing Telegram bot...');
      await this.telegram.initialize();

      this.logger.info('Initialization complete');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Initialization failed:', new Error(errorMessage));
      throw error;
    }
  }

  async start(): Promise<void> {
    try {
      // Initialize all components first
      await this.initialize();

      const config = await this.storage.getConfig();
      this.isRunning = true;

      this.logger.info('Twitter Notifier started successfully');

      // Main polling loop
      while (this.isRunning) {
        await this.processNewTweets();
        await new Promise(resolve =>
          setTimeout(resolve, config.twitter.pollingInterval)
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(
        'Failed to start Twitter Notifier',
        new Error(errorMessage)
      );
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.telegram) {
      try {
        await this.telegram.stop();
      } catch (error) {
        this.logger.error('Error during shutdown', error as Error);
      }
    }
    this.logger.info('Twitter Notifier stopped');
  }

  /**
   * Creates a simplified fallback message format for when the regular format fails
   */
  private createFallbackMessage(tweet: Tweet, topicId: string): FormattedMessage {
    try {
      // Create a minimal format with basic escaping
      const username = MessageFormatter.escapeMarkdown(tweet.username);
      const text = MessageFormatter.escapeMarkdown(tweet.text);
      const tweetUrl = MessageFormatter.escapeMarkdown(
        `https://twitter.com/${tweet.username}/status/${tweet.id}`
      );

      return {
        text: [
          `Tweet from @${username}:`,
          text,
          '',
          tweetUrl
        ].join('\n'),
        parse_mode: 'MarkdownV2',
        message_thread_id: parseInt(topicId),
        disable_web_page_preview: true
      };
    } catch (error) {
      // If even the fallback fails, return ultra-safe format
      return {
        text: `New tweet from @${tweet.username}: ` +
          `https://twitter.com/${tweet.username}/status/${tweet.id}`,
        parse_mode: 'MarkdownV2',
        message_thread_id: parseInt(topicId),
        disable_web_page_preview: true
      };
    }
  }

  /**
   * Attempts to send a formatted tweet message with validation and error recovery
   */
  private async sendFormattedTweet(tweet: Tweet, topicId: string): Promise<boolean> {
    try {
      let formattedMessage = MessageFormatter.formatTweet(tweet, topicId);

      // Validate message formatting before sending
      if (!MessageFormatter.validateFormattedMessage(formattedMessage)) {
        this.logger.warn(
          `Invalid message formatting detected for tweet ${tweet.id}. Attempting fallback format.`
        );
        
        formattedMessage = this.createFallbackMessage(tweet, topicId);
      }
      await this.telegram.sendMessage(formattedMessage);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send formatted tweet ${tweet.id}:`, error as Error);
      return false;
    }
  }

  /**
   * Fetches new tweets from each topic's query, sends them to Telegram (if not already seen),
   * and updates lastTweetId in storage.
   */
  private async processNewTweets(): Promise<void> {
    try {
      const config = await this.storage.getConfig();
      this.logger.debug('Starting tweet processing cycle');

      let totalTweetsProcessed = 0;

      // Loop over each configured search query
      for (const [topicId, topic] of Object.entries<SearchQueryConfig>(config.twitter.searchQueries)) {
        try {
          const searchConfig = topic;
          const query = this.searchBuilder.buildQuery(searchConfig);

          if (!query) {
            this.logger.warn(`Empty query for topic ${this.getTopicName(topicId)}`);
            continue;
          }

          this.logger.debug(`Searching tweets for ${this.getTopicName(topicId)}`);
          const tweets = await this.twitter.searchTweets(query, searchConfig);

          if (tweets.length > 0) {
            this.logger.debug(`Found ${tweets.length} new tweets for ${this.getTopicName(topicId)}`);
          }

          // Process each tweet
          for (const tweet of tweets) {
            // Only proceed if this tweet hasn't been sent in THIS topic
            if (!await this.storage.hasSeen(tweet.id, topicId)) {
              // For mention monitor (381), ensure we have an explicit mention
              if (topicId === '381') {
                let mentions: string[] = ['TrojanOnSolana'];
                
                if (searchConfig.type === 'structured') {
                  mentions = searchConfig.mentions || mentions;
                } else {
                  // Extract mentions from raw query
                  const mentionMatches = searchConfig.query.match(/@(\w+)/g);
                  if (mentionMatches) {
                    mentions = mentionMatches.map(m => m.replace('@', ''));
                  }
                }
                
                if (!this.messageValidator.validateTweet(tweet, true, mentions)) {
                  this.logger.debug(`Skipping tweet ${tweet.id} - no explicit mention`);
                  continue;
                }
              }

              // Send message to Telegram
              this.logger.debug(`Sending tweet ${tweet.id} for ${this.getTopicName(topicId)}`);
              
              const sent = await this.sendFormattedTweet(tweet, topicId);
              if (sent) {
                totalTweetsProcessed++;
              } else {
                this.logger.warn(`Failed to send tweet ${tweet.id} for ${this.getTopicName(topicId)}`);
              }

              // Mark tweet as seen for this topic
              await this.storage.markSeen(tweet.id, topicId);
            }
          }

          // Update last tweet ID if any tweets were found
          if (tweets.length > 0) {
            await this.storage.updateLastTweetId(topicId, tweets[0].id);
          }
        } catch (error) {
          this.logger.error(`Error processing topic ${this.getTopicName(topicId)}:`, error as Error);
          continue;
        }
      }

      this.logger.debug(`Processed ${totalTweetsProcessed} new tweets`);

      // Periodically clean up old records
      await this.storage.cleanup();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error('Failed to process tweets', new Error(errorMessage));
    }
  }

  /**
   * Helper to map known topic IDs to human-friendly names.
   */
  private getTopicName(topicId: string): string {
    switch (topicId) {
      case '381':
        return 'Trojan Monitor';
      case '377':
        return 'Competitor Monitor';
      default:
        return `Topic ${topicId}`;
    }
  }
}
