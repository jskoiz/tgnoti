import { injectable, inject } from 'inversify';
import { Logger } from '../../../types/logger.js';
import { TYPES } from '../../../types/di.js';
import { PipelineStage, StageResult, TweetContext } from '../types/PipelineTypes.js';
import { MetricsManager } from '../../monitoring/MetricsManager.js';
import { ErrorHandler } from '../../../utils/ErrorHandler.js';
import { TopicFilterManager } from '../../../telegram/bot/TopicFilterManager.js';
import { UsernameHandler } from '../../../utils/usernameHandler.js';
import { SearchConfig } from '../../../config/searchConfig.js';
import { MONITORING_ACCOUNTS } from '../../../config/monitoring.js';

interface FilterConfig {
  enableAgeFiltering: boolean;
  windowMinutes: number;
  enableUsernameFiltering: boolean;
  enableContentFiltering: boolean;
}

@injectable()
export class FilterStage implements PipelineStage<TweetContext, TweetContext> {
  public readonly name = 'filter';

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ErrorHandler) private errorHandler: ErrorHandler,
    @inject(TYPES.TopicFilterManager) private filterManager: TopicFilterManager,
    @inject(TYPES.UsernameHandler) private usernameHandler: UsernameHandler,
    @inject(TYPES.SearchConfig) private searchConfig: SearchConfig
  ) {}

  /**
   * Execute the filter stage
   */
  async execute(context: TweetContext): Promise<StageResult<TweetContext>> {
    const startTime = Date.now();

    try {
      // Check if this is a competitor tweet or mention that should be redirected
      const competitorRedirectResult = await this.checkCompetitorRedirect(context);
      if (competitorRedirectResult.success) {
        return competitorRedirectResult;
      }
      
      // Get topic-specific filters and config
      const topicFilters = await this.filterManager.getFilters(Number(context.topicId));
      const filterConfig = await this.getFilterConfig(context.topicId);
      
      // Require at least one filter to be configured
      if (topicFilters.length === 0) {
        return {
          success: false,
          data: context,
          error: new Error('No filters configured for topic'),
          metadata: {
            reason: 'no_filters'
          }
        };
      }

      // Check username filtering if enabled
      if (filterConfig.enableUsernameFiltering) {
        const usernameResult = await this.checkUsernameFilter(context, topicFilters);
        if (!usernameResult.success) {
          return usernameResult;
        }
      }

      // Check content filtering if enabled
      if (filterConfig.enableContentFiltering) {
        const contentResult = await this.checkContentFilter(context, topicFilters);
        if (!contentResult.success) {
          return contentResult;
        }
      }

      // Mark tweet as filtered in context
      const updatedContext: TweetContext = {
        ...context,
        filtered: true,
        metadata: {
          ...context.metadata,
          filter: {
            matched: true,
            rules: this.getMatchedRules(context, filterConfig),
            filterDurationMs: Date.now() - startTime
          }
        }
      };

      this.recordMetrics(startTime, true);

      return {
        success: true,
        data: updatedContext,
        metadata: {
          filter: {
            matched: true,
            rules: this.getMatchedRules(context, filterConfig),
            filterDurationMs: Date.now() - startTime
          }
        }
      };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.errorHandler.handleError(err, 'Filter stage');
      this.recordMetrics(startTime, false);
      
      return {
        success: false,
        data: context,
        error: err,
        metadata: {
          filter: {
            matched: false,
            rules: [],
            filterDurationMs: Date.now() - startTime
          },
          error: { type: err.name, message: err.message }
        }
      };
    }
  }

  /**
   * Check if tweet should be redirected to competitor channels
   */
  private async checkCompetitorRedirect(context: TweetContext): Promise<StageResult<TweetContext>> {
    // Get all competitor accounts
    const competitorAccounts = MONITORING_ACCOUNTS.filter(account => 
      [5572, 5573, 5574, 6355, 6317, 6314, 6320].includes(account.topicId)
    ).map(account => account.account.toLowerCase());
    
    // Check if tweet is FROM a competitor
    const tweetUsername = this.usernameHandler.normalizeUsername(context.tweet.tweetBy.userName);
    if (competitorAccounts.includes(tweetUsername)) {
      this.logger.info(`Redirecting tweet FROM competitor @${tweetUsername} to Competitor Mentions channel`, {
        tweetId: context.tweet.id,
        originalTopicId: context.topicId,
        newTopicId: '12110'
      });
      
      // Update context with new topic ID
      const updatedContext: TweetContext = {
        ...context,
        topicId: '12110', // Competitor Mentions channel
        filtered: true,
        metadata: {
          ...context.metadata,
          filter: {
            matched: true,
            rules: ['competitor_tweet_redirect'],
            filterDurationMs: Date.now() - (context.metadata?.processingStartTime || Date.now())
          },
          redirectReason: 'competitor_tweet'
        }
      };
      
      return {
        success: true,
        data: updatedContext,
        metadata: {
          filter: {
            matched: true,
            rules: ['competitor_tweet_redirect'],
            filterDurationMs: Date.now() - (context.metadata?.processingStartTime || Date.now())
          },
          redirectReason: 'competitor_tweet'
        }
      };
    }
    
    // Check if tweet MENTIONS a competitor
    const mentionedUsers = context.tweet.entities?.mentionedUsers || [];
    const mentionsCompetitor = mentionedUsers.some(mention => 
      competitorAccounts.includes(this.usernameHandler.normalizeUsername(mention))
    );
    
    if (mentionsCompetitor) {
      const mentionedCompetitors = mentionedUsers
        .filter(mention => competitorAccounts.includes(this.usernameHandler.normalizeUsername(mention)))
        .map(mention => this.usernameHandler.normalizeUsername(mention));
      
      this.logger.info(`Redirecting tweet that MENTIONS competitors to Competitor Tweets channel`, {
        tweetId: context.tweet.id,
        originalTopicId: context.topicId,
        newTopicId: '12111',
        mentionedCompetitors
      });
      
      // Update context with new topic ID
      const updatedContext: TweetContext = {
        ...context,
        topicId: '12111', // Competitor Tweets channel
        filtered: true,
        metadata: {
          ...context.metadata,
          filter: {
            matched: true,
            rules: ['competitor_mention_redirect'],
            filterDurationMs: Date.now() - (context.metadata?.processingStartTime || Date.now())
          },
          redirectReason: 'competitor_mention',
          mentionedCompetitors
        }
      };
      
      return {
        success: true,
        data: updatedContext,
        metadata: {
          filter: {
            matched: true,
            rules: ['competitor_mention_redirect'],
            filterDurationMs: Date.now() - (context.metadata?.processingStartTime || Date.now())
          },
          redirectReason: 'competitor_mention',
          mentionedCompetitors
        }
      };
    }
    
    // Not a competitor tweet or mention, continue with normal processing
    return { success: false, data: context };
  }

  /**
   * Get filter configuration for a topic
   */
  private async getFilterConfig(topicId: string): Promise<FilterConfig> {
    const config = await this.searchConfig.getTopicConfig(topicId);
    return {
      enableAgeFiltering: config.enableAgeFiltering ?? true,
      windowMinutes: config.windowMinutes ?? this.searchConfig.getSearchWindowMinutes(),
      enableUsernameFiltering: config.enableUsernameFiltering ?? true,
      enableContentFiltering: config.enableContentFiltering ?? true
    };
  }

  /**
   * Check username filter
   */
  private async checkUsernameFilter(
    context: TweetContext,
    filters: any[]
  ): Promise<StageResult<TweetContext>> {
    const usernameFilter = filters.find(f => f.type === 'user' || f.type === 'mention');
    if (!usernameFilter) {
      return {
        success: false,
        data: context,
        error: new Error('No username filter configured'),
        metadata: { reason: 'no_username_filter' }
      };
    }

    // Enhanced logging for username debugging
    const normalizedFilterUsername = this.usernameHandler.normalizeUsername(usernameFilter.value);
    const normalizedTweetUsername = this.usernameHandler.normalizeUsername(context.tweet.tweetBy.userName);
    const normalizedMentions = context.tweet.entities?.mentionedUsers?.map(u => 
      this.usernameHandler.normalizeUsername(u)
    ) || [];

    // Log username comparison only at debug level
    this.logger.debug('Username filter check', {
      tweetId: context.tweet.id,
      topicId: context.topicId,
      filterUsername: normalizedFilterUsername,
      tweetUsername: normalizedTweetUsername,
      mentionCount: normalizedMentions.length
    });
    
    // Check if tweet is relevant to the user
    if (!this.usernameHandler.isTweetRelevantToUser(context.tweet, usernameFilter.value)) {
      return {
        success: false,
        data: context,
        error: new Error(`Tweet does not contain username: ${normalizedFilterUsername}`),
        metadata: {
          reason: 'missing_username',
          filterUsername: normalizedFilterUsername,
          tweetUsername: normalizedTweetUsername,
          tweetId: context.tweet.id
        }
      };
    }

    return { success: true, data: context };
  }

  /**
   * Check content filter
   */
  private async checkContentFilter(
    context: TweetContext,
    filters: any[]
  ): Promise<StageResult<TweetContext>> {
    const contentFilters = filters.filter(f => f.type === 'content');
    if (contentFilters.length === 0) {
      return { success: true, data: context }; // No content filters configured
    }

    const tweetText = context.tweet.text.toLowerCase();
    const matchedFilter = contentFilters.find((filter: { type: string; value: string }) => 
      filter.value.toLowerCase().split(',').some((keyword: string) => 
        tweetText.includes(keyword.trim().toLowerCase())
      )
    );

    if (!matchedFilter) {
      return {
        success: false,
        data: context,
        error: new Error('Tweet does not match content filters'),
        metadata: {
          reason: 'content_mismatch'
        }
      };
    }

    return { success: true, data: context };
  }

  /**
   * Get list of matched filter rules
   */
  private getMatchedRules(context: TweetContext, config: FilterConfig): string[] {
    const rules: string[] = [];

    if (config.enableUsernameFiltering) {
      rules.push('username_match');
    }
    
    if (config.enableContentFiltering) {
      rules.push('content_match');
    }

    return rules;
  }

  /**
   * Record filter metrics
   */
  private recordMetrics(startTime: number, success: boolean): void {
    const duration = Date.now() - startTime;
    this.metrics.timing('pipeline.filter.duration', duration);
    this.metrics.increment(`pipeline.filter.${success ? 'success' : 'failure'}`);
  }
}