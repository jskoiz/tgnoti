import { Tweet, TweetUser } from './twitter.js';
import { ObjectId } from 'mongodb';
import { AffiliateDocument } from './affiliates.js';

export interface TweetDocument extends Tweet {
  _id?: ObjectId;
  sentiment?: {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
    aspects: Array<{
      topic: string;
      sentiment: string;
      score: number;
    }>;
    analyzedAt: Date;
  };
  processingStatus: {
    isAnalyzed: boolean;
    attempts: number;
    lastAttempt?: Date;
    error?: string;
  };
  metadata: {
    source: string;
    topicId: string;
    capturedAt: Date;
    version: number;
  };
}

export interface TopicFilterDocument {
  topicId: number;
  filterType: 'user' | 'mention' | 'keyword';
  value: string;
  createdAt: Date;
  createdBy?: number;
}

export interface MongoConfig {
  uri: string;
  dbName: string;
  collections: {
    tweets: string;
    topicFilters: string;
    affiliates: string;
  };
}

export interface MongoIndexConfig {
  tweets: {
    id: { unique: true };
    'metadata.topicId': { unique: false };
    'metadata.capturedAt': { unique: false };
    'processingStatus.isAnalyzed': { unique: false };
    text: { text: true };
  };
  topicFilters: {
    'topicId': { unique: false };
    'topicId_filterType_value': { unique: true };
  };
  affiliates: {
    'userId': { unique: true };
    'userName': { unique: false };
    'lastChecked': { unique: false };
  };
}