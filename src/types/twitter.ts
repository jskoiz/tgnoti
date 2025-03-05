import { TweetEntities, TweetMedia, Tweet as RettiwtTweet, User as RettiwtUser, TweetFilter as RettiwtTweetFilter } from 'rettiwt-api';

// Our internal user type
export interface TweetUser {
  userName: string;
  displayName: string;
  fullName: string;
  description?: string;
  followersCount: number;
  followingCount: number;
  statusesCount: number;
  verified: boolean;
  isVerified: boolean;  // Alias for backward compatibility
  verifiedType?: 'none' | 'blue' | 'business' | 'government';
  createdAt: string;
}

// Our internal tweet type
export interface Tweet {
  id: string;
  text: string;
  createdAt: string;
  
  // User info
  tweetBy: TweetUser;
  
  // Engagement metrics
  replyCount: number;
  retweetCount: number;
  likeCount: number;
  viewCount: number;
  
  // Media
  media?: {
    url: string;
    type: 'photo' | 'video' | 'gif';
  }[];
  
  // Quote/Retweet
  quotedTweet?: Tweet;
  replyToTweet?: Tweet;  // Added for reply context
  isRetweet?: boolean;
  
  // Entities
  entities?: {
    hashtags: string[];
    mentionedUsers: string[];
    urls: string[];
  };
}

// Re-export TweetFilter with additional pagination properties
export interface TweetFilter extends RettiwtTweetFilter {
  maxResults?: number;
  paginationToken?: string;
}

// Search response type
export interface SearchResponse {
  data: Tweet[];
  meta?: {
    next_token?: string;
    previous_token?: string;
  };
}

// Safe type assertion helper
function getVerifiedType(user: RettiwtUser): 'none' | 'blue' | 'business' | 'government' {
  if ('verifiedType' in user) {
    return (user as { verifiedType: string }).verifiedType as 'none' | 'blue' | 'business' | 'government';
  }
  if ('verified_type' in user) {
    return (user as { verified_type: string }).verified_type as 'none' | 'blue' | 'business' | 'government';
  }
  return 'none';
}

// Mapping functions
export function mapRettiwtUserToTweetUser(user: RettiwtUser): TweetUser {
  return {
    userName: user.userName.toLowerCase(), // Normalize username to lowercase
    displayName: user.fullName,
    fullName: user.fullName,
    description: user.description,
    followersCount: user.followersCount,
    followingCount: user.followingsCount,
    statusesCount: user.statusesCount,
    verified: user.isVerified,
    isVerified: user.isVerified,  // Add both properties for compatibility
    verifiedType: getVerifiedType(user),
    createdAt: user.createdAt
  };
}

export function mapRettiwtTweetToTweet(rettiwtTweet: RettiwtTweet): Tweet {
  const quotedTweet = 'quotedTweet' in rettiwtTweet 
    ? (rettiwtTweet as { quotedTweet?: RettiwtTweet }).quotedTweet
    : (rettiwtTweet as { quoted_tweet?: RettiwtTweet }).quoted_tweet;
    
  // Handle reply context through referenced tweets
  const replyToTweet = 'referencedTweets' in rettiwtTweet 
    ? (rettiwtTweet as { referencedTweets?: { type: string; tweet: RettiwtTweet }[] }).referencedTweets?.find(
        ref => ref.type === 'replied_to'
      )?.tweet
    : (rettiwtTweet as { referenced_tweets?: { type: string; tweet: RettiwtTweet }[] }).referenced_tweets?.find(
        ref => ref.type === 'replied_to'
      )?.tweet;

  const isRetweet = 'isRetweet' in rettiwtTweet
    ? (rettiwtTweet as { isRetweet?: boolean }).isRetweet
    : (rettiwtTweet as { is_retweet?: boolean }).is_retweet || false;

  return {
    id: rettiwtTweet.id,
    text: rettiwtTweet.fullText,
    createdAt: rettiwtTweet.createdAt,
    tweetBy: mapRettiwtUserToTweetUser(rettiwtTweet.tweetBy),
    replyCount: rettiwtTweet.replyCount,
    retweetCount: rettiwtTweet.retweetCount,
    likeCount: rettiwtTweet.likeCount,
    viewCount: rettiwtTweet.viewCount,
    media: rettiwtTweet.media?.map(m => ({
      url: m.url,
      type: m.type as 'photo' | 'video' | 'gif'
    })),
    quotedTweet: quotedTweet ? mapRettiwtTweetToTweet(quotedTweet) : undefined,
    replyToTweet: replyToTweet ? mapRettiwtTweetToTweet(replyToTweet) : undefined,
    isRetweet,
    entities: rettiwtTweet.entities ? {
      hashtags: rettiwtTweet.entities.hashtags || [],
      mentionedUsers: rettiwtTweet.entities.mentionedUsers || [],
      urls: rettiwtTweet.entities.urls || []
    } : undefined
  };
}

// Query types
export type QueryOperator = 'AND' | 'OR' | 'NOT';

export interface QueryGroup {
  operator: QueryOperator;
  conditions: (string | QueryGroup)[];
}

export interface AdvancedFilter {
  hashtags?: string[];
  cashtags?: string[];
  includeWords?: string[];
  includePhrase?: string;
  excludeWords?: string[];
  from_verified?: boolean;
  has_links?: boolean;
  has_media?: boolean;
  include_replies?: boolean;
  fromUsers?: string[];
  mentions?: string[];
}

export interface SearchQueryConfig {
  type: 'structured';
  searchId?: string;  // ID of the search operation for tracking
  keywords?: string[];
  accounts?: string[];
  mentions?: string[];
  language: string;
  startTime?: string;
  endTime?: string;
  excludeQuotes?: boolean;
  excludeRetweets?: boolean;
  minLikes?: number;
  minRetweets?: number;
  minReplies?: number;
  operator?: QueryOperator;
  queryGroups?: QueryGroup[];
  advancedFilters?: AdvancedFilter;
  cursor?: SearchCursor;
}

export interface SearchCursor {
  nextToken?: string;
  hasMore: boolean;
}

export interface PaginatedSearch {
  tweets: Tweet[];
  cursor: SearchCursor;
}