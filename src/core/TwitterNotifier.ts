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
  private telegram: TelegramBot;
  private twitter: TwitterClient;
  private isRunning: boolean = false;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MessageValidator) private messageValidator: MessageValidator,
    @inject(TYPES.TelegramBot) telegram: TelegramBot,
    @inject(TYPES.TwitterClient) twitter: TwitterClient,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.Storage) private storage: Storage,
    @inject(TYPES.SearchBuilder) private searchBuilder: SearchBuilder
  ) {
    this.telegram = telegram;
    this.twitter = twitter;
  }

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
      await this.telegram.sendMessage(MessageFormatter.formatSystem('Service started'));
      
      while (this.isRunning) {
        await this.processNewTweets();
        await new Promise(resolve => setTimeout(resolve, config.twitter.pollingInterval));
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error('Failed to start Twitter Notifier', new Error(errorMessage));
      
      // Try to send error notification if telegram is initialized
      if (this.telegram) {
        try {
          await this.telegram.sendMessage(MessageFormatter.formatSystem(`Service error: ${errorMessage}`));
        } catch (notifyError) {
          this.logger.error('Failed to send error notification', notifyError as Error);
        }
      }
      
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.telegram) {
      try {
        await this.telegram.sendMessage(MessageFormatter.formatSystem('Service stopping'));
        await this.telegram.stop();
      } catch (error) {
        this.logger.error('Error during shutdown', error as Error);
      }
    }
    this.logger.info('Twitter Notifier stopped');
  }

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
        config.keywords = lastGroup.slice(1, -1).split(' OR ').map(k => k.trim());
      }
    }
    return config;
  }

  private async processNewTweets(): Promise<void> {
    try {
      const config = await this.storage.getConfig();
      this.logger.debug('Starting tweet processing cycle');
      
      let totalTweetsProcessed = 0;
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

        for (const tweet of tweets) {
          // Check if tweet has been seen for this specific topic
          if (!await this.storage.hasSeen(tweet.id, topicId)) {
            // For mention monitor (382), validate explicit mentions
            if (topicId === '381' && !this.messageValidator.validateTweet(tweet, true, 
                searchConfig.mentions || ['TrojanOnSolana'])) {
              this.logger.debug(`Skipping tweet ${tweet.id} - no explicit mention`);
              await this.storage.markSeen(tweet.id, topicId);
              continue;
            }
            
            this.logger.debug(`Processing tweet for ${this.getTopicName(topicId)}`);
            await this.telegram.sendMessage(MessageFormatter.formatTweet(tweet, topicId));
            await this.storage.markSeen(tweet.id, topicId);
            totalTweetsProcessed++;
          }
        }

        // Update last tweet ID if we got any tweets
        if (tweets.length > 0) {
          await this.storage.updateLastTweetId(topicId, tweets[0].id);
        }
      }
      
      this.logger.debug(`Processed ${totalTweetsProcessed} new tweets`);

      // Cleanup old tweets periodically
      await this.storage.cleanup();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error('Failed to process tweets', new Error(errorMessage));
    }
  }

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