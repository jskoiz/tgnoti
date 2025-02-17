import { TwitterApi, TweetV2, UserV2, MediaObjectV2 } from 'twitter-api-v2';
import { Rettiwt, User } from 'rettiwt-api';
import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../types/metrics.js';
import { Tweet, SearchConfig, AffiliatedAccount, ExtendedUserV2, TeamMemberResponse, GraphQLVariables, GraphQLFeatures } from '../types/twitter.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';
import { ConfigManager } from '../config/ConfigManager.js';
import { TYPES } from '../types/di.js';
import fetch from 'node-fetch';

@injectable()
export class TwitterClient {
  private client: TwitterApi;
  private rettiwt: Rettiwt;
  private bearerToken: string;
  private rettiwtApiKey: string;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.CircuitBreaker) private circuitBreaker: CircuitBreaker,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.ConfigManager) configManager: ConfigManager
  ) {
    this.rettiwtApiKey = configManager.getEnvConfig<string>('RETTIWT_API_KEY');
    this.bearerToken = configManager.getEnvConfig<string>('BEARER_TOKEN');
    if (!this.bearerToken) {
      throw new Error('BEARER_TOKEN environment variable is required');
    }
    this.client = new TwitterApi(this.bearerToken);
    this.rettiwt = new Rettiwt({ apiKey: this.rettiwtApiKey });
  }

  async initialize(): Promise<void> {
    try {
      await this.circuitBreaker.execute(() => 
        this.client.v2.search('from:twitter', {
          'tweet.fields': ['created_at']
        })
      );
      this.logger.info('Twitter API connection verified');
    } catch (error) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        process.exit(1);
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('403')) {
        throw new Error('Failed to initialize Twitter client: Invalid bearer token or insufficient permissions');
      }
      throw new Error(`Failed to initialize Twitter client: ${errorMessage}`);
    }
  }

  private handleApiError(error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (errorMessage.toLowerCase().includes('401') || 
        errorMessage.toLowerCase().includes('403') ||
        errorMessage.toLowerCase().includes('unauthorized')) {
      this.logger.error('Invalid Twitter bearer token or insufficient permissions. Please check BEARER_TOKEN environment variable');
      process.exit(1);
    }

    if (errorMessage.toLowerCase().includes('429') ||
        errorMessage.toLowerCase().includes('rate limit')) {
      this.logger.error('Twitter API rate limit exceeded. Please wait before retrying.');
      process.exit(1);
    }

    throw error instanceof Error ? error : new Error(errorMessage);
  }

  private convertToAffiliatedAccount(user: User): AffiliatedAccount {
    return {
      type: 'organization',
      id: user.id,
      username: user.userName,
      displayName: user.fullName,
      verified_type: user.isVerified ? 'business' : 'none',
      subscription_type: 'None',
      affiliation: {
        url: '', // No direct URL in User type
        description: user.description || '',
        badge_url: user.profileImage || '',
        user_id: user.id
      }
    };
  }

  private convertTeamMemberToAffiliatedAccount(member: TeamMemberResponse['data']['user']['result']['timeline']['timeline']['instructions'][0]['entries'][0]['content']['itemContent']['user_results']['result']): AffiliatedAccount {
    return {
      type: 'team_member',
      id: member.rest_id,
      username: member.legacy.screen_name,
      displayName: member.legacy.name,
      verified_type: member.legacy.verified_type as 'none' | 'blue' | 'business' | 'government' || 'none',
      subscription_type: 'None',
      affiliation: {
        url: member.affiliates_highlighted_label?.label?.url?.url || '',
        description: member.legacy.description || '',
        badge_url: member.legacy.profile_image_url_https || '',
        user_id: member.rest_id
      }
    };
  }

  private async fetchTeamMembers(userId: string): Promise<TeamMemberResponse> {
    const variables: GraphQLVariables = {
      userId,
      count: 20,
      teamName: "NotAssigned",
      includePromotedContent: false,
      withClientEventToken: false,
      withVoice: true
    };

    const features: GraphQLFeatures = {
      profile_label_improvements_pcf_label_in_post_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true
    };

    const queryParams = new URLSearchParams({
      variables: JSON.stringify(variables),
      features: JSON.stringify(features)
    });

    const url = `https://x.com/i/api/graphql/0M9yTHGhZjdIIxIcI9H2xQ/UserBusinessProfileTeamTimeline?${queryParams}`;

    const response = await fetch(url, {
      headers: {
        'authorization': `Bearer ${this.bearerToken}`,
        'content-type': 'application/json',
        'x-twitter-active-user': 'yes',
        'x-twitter-auth-type': 'OAuth2Session',
        'x-twitter-client-language': 'en'
      }
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<TeamMemberResponse>;
  }

  private extractTeamMembers(response: TeamMemberResponse): AffiliatedAccount[] {
    const instructions = response.data?.user?.result?.timeline?.timeline?.instructions;
    if (!instructions?.length) return [];

    return instructions[0].entries
      .filter(entry => 
        entry.content?.itemContent?.user_results?.result?.legacy?.screen_name
      )
      .map(entry => 
        this.convertTeamMemberToAffiliatedAccount(entry.content.itemContent.user_results.result)
      );
  }

  private async getTeamMembers(userId: string): Promise<AffiliatedAccount[]> {
    try {
      const response = await this.circuitBreaker.execute(() => this.fetchTeamMembers(userId));
      return this.extractTeamMembers(response);
    } catch (error) {
      this.logger.error('Failed to fetch team members:', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  async getAffiliatedAccounts(username: string): Promise<AffiliatedAccount[]> {
    try {
      this.logger.debug(`Fetching affiliated accounts for user: ${username}`);
      this.metrics.increment('affiliate.fetch.attempt');
      
      // Get user details using Rettiwt's user service
      const userDetails = await this.circuitBreaker.execute(() =>
        this.retryWithBackoff(() => this.rettiwt.user.details(username))
      );

      if (!userDetails?.id) {
        this.metrics.increment('affiliate.fetch.error');
        throw new Error(`User ${username} not found`);
      }

      // Get organization account
      const orgAccount = this.convertToAffiliatedAccount(userDetails);
      
      // Try to get team members
      let teamMembers: AffiliatedAccount[] = [];
      try {
        this.metrics.increment('affiliate.team_members.fetch.attempt');
        teamMembers = await this.getTeamMembers(userDetails.id);
        this.metrics.increment('affiliate.team_members.fetch.success');
        this.metrics.gauge('affiliate.team_members.count', teamMembers.length);
      } catch (error) {
        this.metrics.increment('affiliate.team_members.fetch.error');
        this.logger.error('Failed to fetch team members, falling back to organization only:', error instanceof Error ? error : new Error(String(error)));
      }

      // Combine organization and team members
      const allAccounts = [orgAccount, ...teamMembers];
      this.metrics.increment('affiliate.fetch.success');
      this.metrics.gauge('affiliate.accounts.count', allAccounts.length);
      return allAccounts;

    } catch (error) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        return [];
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Failed to fetch affiliated accounts', new Error(errorMessage));
      this.metrics.increment('affiliate.fetch.error');
      
      return [];
    }
  }

  async getUserDetails(username: string): Promise<User | null> {
    try {
      this.logger.debug(`Fetching user details for: ${username}`);
      this.metrics.increment('user.details.fetch.attempt');
      const userDetails = await this.circuitBreaker.execute(() =>
        this.retryWithBackoff(() => this.rettiwt.user.details(username))
      );
      
      if (!userDetails) {
        this.logger.debug(`No user found with username: ${username}`);
        return null;
      } else {
        this.logger.debug(`Found user details: ${JSON.stringify(userDetails, null, 2)}`);
        this.metrics.increment('user.details.fetch.success');
      }
      return userDetails;
    } catch (error) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to fetch user details for ${username}:`, new Error(errorMessage));
      return null;
    }
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxRetries) throw error;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        this.logger.debug(`Retry attempt ${attempt} failed, waiting ${delay}ms before next attempt`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('All retry attempts failed');
  }

  async searchTweets(query: string, config?: SearchConfig): Promise<Tweet[]> {
    try {
      this.logger.debug(`Executing Twitter search with query: ${query}`);
      const searchParams: any = {
        'tweet.fields': ['created_at', 'author_id', 'entities'],
        'user.fields': ['name', 'username', 'public_metrics'],
        'media.fields': ['url', 'preview_image_url'],
        'expansions': ['author_id', 'attachments.media_keys']
      };

      if (config?.startTime) {
        const date = new Date(config.startTime);
        searchParams.start_time = date.toISOString();
      }

      const result = await this.circuitBreaker.execute(() => 
        this.client.v2.search(query, searchParams)
      );

      if (!result.data || !result.data.data) {
        this.logger.debug('No tweets found in search result');
        return [];
      }

      return result.data.data.map((tweet: TweetV2) => {
        const user = result.includes?.users?.find(u => u.id === tweet.author_id);
        const media = tweet.attachments?.media_keys?.map(key => 
          result.includes?.media?.find(m => m.media_key === key)
        )[0] as MediaObjectV2 | undefined;

        return {
          id: tweet.id,
          text: tweet.text,
          username: user?.username || '',
          displayName: user?.name || '',
          mediaUrl: media?.url || media?.preview_image_url,
          createdAt: tweet.created_at || new Date().toISOString(),
          followersCount: user?.public_metrics?.followers_count,
          followingCount: user?.public_metrics?.following_count
        };
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Circuit breaker is open') {
        this.logger.error('Twitter API is currently unavailable');
        return [];
      }

      if (error instanceof Error && 
          (error.message.includes('401') || 
           error.message.includes('403') ||
           error.message.includes('429'))) {
        this.handleApiError(error);
      }

      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
      
      this.logger.error('Failed to search tweets', new Error(errorMessage));
      return [];
    }
  }

  getCircuitBreakerStatus(): { failures: number; isOpen: boolean } {
    return this.circuitBreaker.getStatus();
  }
}
