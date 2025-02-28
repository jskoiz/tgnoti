import { Tweet, TweetUser } from './twitter.js';
import { ObjectId } from 'mongodb';

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

export interface MongoConfig {
  uri: string;
  dbName: string;
  collections: {
    tweets: string;
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
}