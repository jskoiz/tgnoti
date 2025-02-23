import { TweetEntities, TweetMedia, Tweet, User } from 'rettiwt-api';

// Use the actual User type from rettiwt-api
export interface RettiwtTweet {
  id: string;
  fullText: string;
  createdAt: string;
  
  // User info - using the actual User type
  tweetBy: User;
  
  // Engagement metrics
  replyCount: number;
  retweetCount: number;
  likeCount: number;
  viewCount: number;
  bookmarkCount: number;
  quoteCount: number;
  
  // Language
  lang: string;
  
  // Media
  media?: TweetMedia[];
  
  // Quote/Retweet - using Tweet type for compatibility
  quotedTweet?: Tweet;
  retweetedTweet?: Tweet;
  isRetweet?: boolean;
  
  // Entities
  entities: TweetEntities;
  
  // Methods
  getQuotedTweet(): Promise<Tweet | null>;
  getRetweetedTweet(): Promise<Tweet | null>;
}