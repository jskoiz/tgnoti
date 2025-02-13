import { injectable, inject } from 'inversify';
import { Storage } from '../storage/storage.js';
import { SearchBuilder } from '../twitter/searchBuilder.js';
import { MessageFormatter } from '../bot/messageFormatter.js';
import { TelegramBot } from '../bot/telegramBot.js';
import { TwitterClient } from '../twitter/twitterClient.js';
import { Logger } from '../types/logger.js';
import { Config, SearchQueryConfig } from '../types/storage.js';
import { SearchConfig } from '../types/twitter.js';
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
   * Converts a SearchQueryConfig to a SearchConfig for the SearchBuilder.
   */
  private parseQueryConfig(queryConfig: SearchQueryConfig): SearchConfig {
    let config: SearchConfig;

    if (queryConfig.type === 'structured') {
      // Handle structured config
      config = {
        accounts: queryConfig.accounts,
        mentions: queryConfig.mentions,
        excludeAccounts: queryConfig.excludeAccounts,
        excludeQuotes: queryConfig.excludeQuotes,
        excludeRetweets: queryConfig.excludeRetweets,
        language: queryConfig.language,
        keywords: queryConfig.keywords,
        operator: queryConfig.operator,
        startTime: queryConfig.startTime
      };
    } else {
      // Handle raw query config
      config = {
        excludeRetweets: queryConfig.excludeRetweets,
        language: queryConfig.language
      };

      const query = queryConfig.query;
      config.rawQuery = query;

      // Extract accounts (from:)
      const accountMatches = query.match(/from:(\w+)/g);
      if (accountMatches) {
        config.accounts = accountMatches.map(m => m.replace('from:', ''));
      }

      // Extract mentions (@)
      const mentionMatches = query.match(/@(\w+)/g);
      if (mentionMatches) {
        config.mentions = mentionMatches.map(m => m.replace('@', ''));
      }

      // Extract keywords from parentheses groups
      const keywordGroups = query.match(/\(([^)]+)\)/g);
      if (keywordGroups) {
        const lastGroup = keywordGroups[keywordGroups.length - 1];
        config.keywords = lastGroup
          .slice(1, -1)
          .split(' OR ')
          .map(k => k.trim());
      }
    }
    return config;
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
        const searchConfig = this.parseQueryConfig(topic);
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
            if (
              topicId === '381' &&
              !this.messageValidator.validateTweet(
                tweet,
                true,
                searchConfig.mentions || ['TrojanOnSolana']
              )
            ) {
              this.logger.debug(`Skipping tweet ${tweet.id} - no explicit mention`);
              continue;
            }

            // Send message to Telegram
            this.logger.debug(`Sending tweet ${tweet.id} for ${this.getTopicName(topicId)}`);
            await this.telegram.sendMessage(MessageFormatter.formatTweet(tweet, topicId));
            totalTweetsProcessed++;

            // Mark tweet as seen for this topic
            await this.storage.markSeen(tweet.id, topicId);
          }
        }

        // Update last tweet ID if any tweets were found
        if (tweets.length > 0) {
          await this.storage.updateLastTweetId(topicId, tweets[0].id);
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
