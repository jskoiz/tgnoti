import { ObjectId } from 'mongodb';

/**
 * Represents a Twitter account affiliate
 */
export interface Affiliate {
  userId: string;
  userName: string;
  fullName: string;
  followersCount: number;
  followingsCount: number;
  isVerified: boolean;
}

/**
 * Represents a change in affiliate status
 */
export interface AffiliateChange {
  type: 'added' | 'removed';
  affiliate: Affiliate;
  timestamp: Date;
}

/**
 * Represents tracking information for a Twitter account's affiliates
 */
export interface AffiliateTracking {
  userId: string;
  userName: string;
  affiliates: Affiliate[];
  lastChecked: Date;
}

/**
 * MongoDB document for storing affiliate data
 */
export interface AffiliateDocument {
  _id?: ObjectId;
  userId: string;         // Twitter user ID being tracked
  userName: string;       // Twitter username being tracked
  affiliates: {
    userId: string;       // Affiliate's Twitter user ID
    userName: string;     // Affiliate's Twitter username
    fullName: string;     // Affiliate's display name
    followersCount: number;
    followingsCount: number;
    isVerified: boolean;
    addedAt: Date;        // When this affiliate was first detected
    removedAt?: Date;     // When this affiliate was removed (if applicable)
    isActive: boolean;    // Whether this affiliate is currently active
  }[];
  lastChecked: Date;      // When affiliates were last checked
  metadata: {
    source: string;
    capturedAt: Date;
    version: number;
  };
}