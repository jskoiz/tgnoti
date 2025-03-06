import { injectable, inject } from 'inversify';
import { MongoClient, Collection, Db, IndexDescription } from 'mongodb';
import { TYPES } from '../../types/di.js';
import { Logger } from '../../types/logger.js';
import { Environment } from '../../config/environment.js';
import { TweetDocument, TopicFilterDocument, MongoConfig, MongoIndexConfig } from '../../types/mongodb.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';

@injectable()
export class MongoDBManager {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private config: MongoConfig;
  private readonly defaultConfig: MongoConfig = {
    uri: '',
    dbName: 'twitter_notifications',
    collections: {
      tweets: 'tweets',
      topicFilters: 'topic_filters'
    }
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('MongoDBManager');
    this.config = this.getConfig();
  }

  private getConfig(): MongoConfig {
    const uri = process.env.MONGO_DB_STRING;
    if (!uri) {
      throw new Error('MongoDB connection string not found in environment');
    }
    return { ...this.defaultConfig, uri };
  }

  async initialize(): Promise<void> {
    try {
      // Check Node.js version for TLS support
      const nodeVersion = process.version.slice(1).split('.').map(Number);
      if (nodeVersion[0] < 14) {
        throw new Error(`MongoDB Atlas requires Node.js 14 or higher for proper TLS support. Current version: ${process.version}`);
      }
      
      this.logger.info('Node.js version check passed', { version: process.version });
      
      this.logger.info('Initializing MongoDB connection...', { uri: this.config.uri });
      this.client = await MongoClient.connect(this.config.uri, {
        serverSelectionTimeoutMS: 5000,
        directConnection: false,
        tls: true,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
        tlsCAFile: undefined // Let Node.js use system CA certificates
      });
      
      this.db = this.client.db(this.config.dbName);
      
      await this.setupCollections();
      await this.createIndexes();
      
      this.logger.info('MongoDB connection established successfully');
      this.metrics.increment('mongodb.connection.success');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.metrics.increment('mongodb.connection.error');
      this.logger.error('Failed to initialize MongoDB connection:', err, { stack: err.stack });
      throw error;
    }
  }

  private async setupCollections(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      const collections = await this.db.listCollections().toArray();
      const collectionNames = collections.map(col => col.name);

      if (!collectionNames.includes(this.config.collections.tweets)) {
        await this.db.createCollection(this.config.collections.tweets);
        this.logger.info(`Created collection: ${this.config.collections.tweets}`);
      }
      
      if (!collectionNames.includes(this.config.collections.topicFilters)) {
        await this.db.createCollection(this.config.collections.topicFilters);
        this.logger.info(`Created collection: ${this.config.collections.topicFilters}`);
      }
    } catch (error) {
      this.logger.error('Failed to setup collections:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const indexConfig: MongoIndexConfig = {
      tweets: {
        id: { unique: true },
        'metadata.topicId': { unique: false },
        'metadata.capturedAt': { unique: false },
        'processingStatus.isAnalyzed': { unique: false },
        text: { text: true }
      },
      topicFilters: {
        'topicId': { unique: false },
        'topicId_filterType_value': { unique: true }
      }
    };

    try {
      const tweetsCollection = this.getTweetsCollection();
      const topicFiltersCollection = this.getTopicFiltersCollection();
      
      // Create indexes for tweets collection
      const indexes: IndexDescription[] = Object.entries(indexConfig.tweets).map(([key, options]) => ({
        key: { [key]: 1 },
        ...options
      }));
      
      // Create indexes for topic filters collection
      const topicFilterIndexes: IndexDescription[] = [
        {
          key: { topicId: 1 },
          unique: false
        },
        {
          key: { topicId: 1, filterType: 1, value: 1 },
          unique: true
        }
      ];
      
      // Apply indexes
      await tweetsCollection.createIndexes(indexes);
      await topicFiltersCollection.createIndexes(topicFilterIndexes);
      this.logger.info('MongoDB indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create indexes:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private getTweetsCollection(): Collection<TweetDocument> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.collection<TweetDocument>(this.config.collections.tweets);
  }

  private getTopicFiltersCollection(): Collection<TopicFilterDocument> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.collection(this.config.collections.topicFilters);
  }

  async saveTweet(tweet: TweetDocument): Promise<void> {
    if (!this.db) throw new Error('Database not initialized - MongoDB connection failed during startup');
    const startTime = Date.now();
    try {
      const collection = this.getTweetsCollection();
      
      const doc = {
        ...tweet,
        processingStatus: {
          isAnalyzed: false,
          attempts: 0
        },
        metadata: {
          source: 'twitter_api',
          topicId: tweet.metadata?.topicId || 'default',
          capturedAt: new Date(),
          version: 1
        }
      };

      await collection.updateOne(
        { id: tweet.id },
        { $set: doc },
        { upsert: true }
      );

      this.metrics.increment('mongodb.tweets.saved');
      this.metrics.timing('mongodb.tweets.save_duration', Date.now() - startTime);
    } catch (error) {
      this.metrics.increment('mongodb.tweets.save_error');
      this.logger.error('Failed to save tweet:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async getTweet(tweetId: string): Promise<TweetDocument | null> {
    try {
      const collection = this.getTweetsCollection();
      return await collection.findOne({ id: tweetId });
    } catch (error) {
      this.logger.error('Failed to get tweet:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async getUnanalyzedTweets(limit: number = 100): Promise<TweetDocument[]> {
    try {
      const collection = this.getTweetsCollection();
      return await collection
        .find({
          'processingStatus.isAnalyzed': false,
          'processingStatus.attempts': { $lt: 3 }
        })
        .limit(limit)
        .toArray();
    } catch (error) {
      this.logger.error('Failed to get unanalyzed tweets:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async updateTweetSentiment(
    tweetId: string,
    sentiment: TweetDocument['sentiment']
  ): Promise<void> {
    try {
      const collection = this.getTweetsCollection();
      await collection.updateOne(
        { id: tweetId },
        {
          $set: {
            sentiment,
            'processingStatus.isAnalyzed': true,
            'processingStatus.lastAttempt': new Date()
          },
          $inc: { 'processingStatus.attempts': 1 }
        }
      );
    } catch (error) {
      this.logger.error('Failed to update tweet sentiment:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.client = null;
        this.db = null;
        this.logger.info('MongoDB connection closed');
      } catch (error) {
        this.logger.error('Failed to close MongoDB connection:', error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    }
  }
}