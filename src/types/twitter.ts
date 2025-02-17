import { UserV2 } from 'twitter-api-v2';

export interface SearchConfig {
  accounts?: string[];    // For account search
  mentions?: string[];    // For mention search
  excludeAccounts?: string[]; // Accounts to exclude from search
  excludeRetweets?: boolean;
  excludeQuotes?: boolean;
  excludeReplies?: boolean;
  language?: string;
  keywords?: string[];    // Additional search terms
  operator?: 'AND' | 'OR'; // How to combine search terms
  rawQuery?: string;      // Raw query string if provided
  startTime?: string;     // Start time for search (ISO string)
}

export interface Tweet {
  id: string;
  text: string;
  username: string;
  displayName: string;
  mediaUrl?: string;
  createdAt: string;
  followersCount?: number;
  followingCount?: number;
}

export interface AffiliationMetadata {
  badge_url?: string;
  description?: string;
  url?: string;
  user_id?: string;
}

// Extend UserV2 with additional fields from the API
export interface ExtendedUserV2 extends Omit<UserV2, 'verified_type'> {
  verified_type?: 'none' | 'blue' | 'business' | 'government';
  subscription_type?: string;
  affiliation?: AffiliationMetadata;
}

export interface AffiliatedAccount {
  type: 'organization' | 'team_member';
  id: string;
  username: string;
  displayName: string;
  verified_type?: 'none' | 'blue' | 'business' | 'government';
  subscription_type?: string;
  affiliation: AffiliationMetadata;
}

export interface TeamMemberResponse {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: Array<{
              type: string;
              entries: Array<{
                content: {
                  itemContent: {
                    user_results: {
                      result: {
                        id: string;
                        rest_id: string;
                        affiliates_highlighted_label?: {
                          label?: {
                            url?: {
                              url: string;
                            };
                            badge?: {
                              url: string;
                            };
                            description: string;
                            userLabelType: string;
                            userLabelDisplayType: string;
                          };
                        };
                        legacy: {
                          screen_name: string;
                          name: string;
                          description?: string;
                          profile_image_url_https?: string;
                          verified_type?: string;
                        };
                      };
                    };
                  };
                };
              }>;
            }>;
          };
        };
      };
    };
  };
}

export interface GraphQLVariables {
  userId: string;
  count: number;
  teamName: string;
  includePromotedContent: boolean;
  withClientEventToken: boolean;
  withVoice: boolean;
}

export interface GraphQLFeatures {
  profile_label_improvements_pcf_label_in_post_enabled: boolean;
  rweb_tipjar_consumption_enabled: boolean;
  responsive_web_graphql_exclude_directive_enabled: boolean;
  verified_phone_label_enabled: boolean;
  creator_subscriptions_tweet_preview_api_enabled: boolean;
  responsive_web_graphql_timeline_navigation_enabled: boolean;
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: boolean;
  premium_content_api_read_enabled: boolean;
  communities_web_enable_tweet_community_results_fetch: boolean;
}