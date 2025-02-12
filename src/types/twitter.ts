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
  id: string;
  username: string;
  displayName: string;
  verified_type?: 'none' | 'blue' | 'business' | 'government';
  subscription_type?: string;
  affiliation: AffiliationMetadata;
}