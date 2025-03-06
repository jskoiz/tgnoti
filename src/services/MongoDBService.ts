import { injectable, inject } from 'inversify';
import { MongoClient, Collection, Db } from 'mongodb';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { TweetDocument, TopicFilterDocument, MongoConfig } from '../types/mongodb.js';
import { Tweet } from '../types/twitter.js';
import { TopicFilter } from '../types/topics.js';
import { MonitorState, MetricsSnapshot } from '../types/monitoring-enhanced.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { Config } from '../types/storage.js';

@injectable()
export class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private configService: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.logger.setComponent('MongoDBService');
  }
  
  async initialize(): Promise<void> {
    const config = this.configService.getMongoDBConfig();
    
    try {
      // Check if MongoDB URI is provided and valid
      if (!config.uri || !config.uri.startsWith('mongodb://') && !config.uri.startsWith('mongodb+srv://')) {
        this.logger.warn('MongoDB URI is not provided or is invalid. Using in-memory mode.');
        this.logger.info('MongoDB initialization skipped (in-memory mode)');
        this.metrics.increment('mongodb.connection.skipped');
        return;
      }
      
      this.logger.info('Initializing MongoDB connection...', { uri: config.uri });
      this.client = await MongoClient.connect(config.uri, {
        serverSelectionTimeoutMS: 5000,
        directConnection: false,
        tls: true,
        tlsAllowInvalidCertificates: false,
        tlsAllowInvalidHostnames: false,
        tlsCAFile: undefined // Let Node.js use system CA certificates
      });
      
      this.db = this.client.db(config.dbName);
      
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
      const config = this.configService.getMongoDBConfig();
      
      // Ensure tweets collection exists
      if (!collectionNames.includes(config.collections.tweets)) {
        await this.db.createCollection(config.collections.tweets);
        this.logger.info(`Created collection: ${config.collections.tweets}`);
      }
      
      // Ensure topic filters collection exists
      if (!collectionNames.includes(config.collections.topicFilters)) {
        await this.db.createCollection(config.collections.topicFilters);
        this.logger.info(`Created collection: ${config.collections.topicFilters}`);
      }
      
      // Ensure monitor state collection exists
      if (!collectionNames.includes('monitorState')) {
        await this.db.createCollection('monitorState');
        this.logger.info('Created collection: monitorState');
      }
      
      if (!collectionNames.includes('metricsSnapshots')) {
        await this.db.createCollection('metricsSnapshots');
        this.logger.info('Created collection: metricsSnapshots');
      }
    } catch (error) {
      this.logger.error('Failed to setup collections:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  private async createIndexes(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    const config = this.configService.getMongoDBConfig();
    
    try {
      // Create indexes for tweets collection
      const tweetsCollection = this.getTweetsCollection();
      await tweetsCollection.createIndexes([
        { key: { id: 1 }, unique: true },
        { key: { 'metadata.topicId': 1 }, unique: false },
        { key: { 'metadata.capturedAt': 1 }, unique: false },
        { key: { 'processingStatus.isAnalyzed': 1 }, unique: false },
        { key: { text: "text" }, unique: false }
      ]);
      
      // Create indexes for topic filters collection
      const topicFiltersCollection = this.getTopicFiltersCollection();
      await topicFiltersCollection.createIndexes([
        { key: { topicId: 1, filterType: 1, value: 1 }, unique: true },
        { key: { topicId: 1 }, unique: false }
      ]);

      // Create indexes for monitor state collection
      const monitorStateCollection = this.getMonitorStateCollection();
      await monitorStateCollection.createIndex({ type: 1 }, { unique: true });

      // Create indexes for metrics snapshots collection
      const metricsSnapshotsCollection = this.getMetricsSnapshotsCollection();
      await metricsSnapshotsCollection.createIndexes([
        { key: { timestamp: 1 }, unique: false },
        { key: { timestamp: -1 }, unique: false }
      ]);

      
      this.logger.info('MongoDB indexes created successfully');
    } catch (error) {
      this.logger.error('Failed to create indexes:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  private getTweetsCollection(): Collection<TweetDocument> {
    if (!this.db) throw new Error('Database not initialized');
    
    // If MongoDB is not initialized, throw a more specific error
    if (!this.client) throw new Error('MongoDB client not initialized. Check your MongoDB URI.');
    
    const config = this.configService.getMongoDBConfig();
    return this.db.collection<TweetDocument>(config.collections.tweets);
  }
  
  private getTopicFiltersCollection(): Collection<TopicFilterDocument> {
    if (!this.db) throw new Error('Database not initialized');
    
    // If MongoDB is not initialized, throw a more specific error
    if (!this.client) throw new Error('MongoDB client not initialized. Check your MongoDB URI.');
    
    const config = this.configService.getMongoDBConfig();
    return this.db.collection<TopicFilterDocument>(config.collections.topicFilters);
  }
  
  private getMonitorStateCollection(): Collection<any> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.collection('monitorState');
  }
  
  private getMetricsSnapshotsCollection(): Collection<MetricsSnapshot> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.collection('metricsSnapshots');
  }

  private getConfigCollection(): Collection<any> {
    if (!this.db) throw new Error('Database not initialized');
    return this.db.collection('config');
  }
  
  // ===== Tweet methods =====
  
  // Tweet methods
  
  async saveTweet(tweet: Tweet, topicId: string): Promise<void> {
    const startTime = Date.now();
    
    // If MongoDB is not initialized, log a warning and return
    if (!this.client || !this.db) {
      this.logger.warn(`MongoDB not initialized. Tweet ${tweet.id} not saved.`);
      return;
    }
    
    try {
      const collection = this.getTweetsCollection();
      
      const doc: TweetDocument = {
        ...tweet,
        metadata: {
          source: 'twitter_api',
          topicId,
          capturedAt: new Date(),
          version: 1
        },
        processingStatus: {
          isAnalyzed: false,
          attempts: 0
        }
      };
      
      await collection.updateOne(
        { id: tweet.id },
        { $set: doc },
        { upsert: true }
      );
      
      this.metrics.increment('mongodb.tweets.saved');
      this.metrics.timing('mongodb.tweets.save_duration', Date.now() - startTime);
      this.logger.debug(`Tweet ${tweet.id} saved for topic ${topicId}`);
    } catch (error) {
      this.metrics.increment('mongodb.tweets.save_error');
      this.logger.error(`Failed to save tweet ${tweet.id}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async hasSeen(tweetId: string, topicId?: string): Promise<boolean> {
    try {
      // If MongoDB is not initialized, return false
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Assuming tweet ${tweetId} has not been seen.`);
        return false;
      }
      
      const collection = this.getTweetsCollection();
      const query: any = { id: tweetId };
      
      if (topicId) {
        query['metadata.topicId'] = topicId;
      }
      
      const count = await collection.countDocuments(query, { limit: 1 });
      return count > 0;
    } catch (error) {
      this.logger.error(`Failed to check if tweet ${tweetId} has been seen:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getTweet(tweetId: string): Promise<TweetDocument | null> {
    try {
      // If MongoDB is not initialized, return null
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot get tweet ${tweetId}.`);
        return null;
      }
      
      const collection = this.getTweetsCollection();
      return await collection.findOne({ id: tweetId });
    } catch (error) {
      this.logger.error(`Failed to get tweet ${tweetId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getUnanalyzedTweets(limit: number = 100): Promise<TweetDocument[]> {
    try {
      // If MongoDB is not initialized, return empty array
      if (!this.client || !this.db) {
        this.logger.warn('MongoDB not initialized. Cannot get unanalyzed tweets.');
        return [];
      }
      
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
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot update sentiment for tweet ${tweetId}.`);
        return;
      }
      
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
      this.logger.error(`Failed to update sentiment for tweet ${tweetId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // ===== Topic filter methods =====
  
  // Topic filter methods
  
  async getTopicFilters(topicId: number): Promise<TopicFilter[]> {
    try {
      // If MongoDB is not initialized, return empty array
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot get filters for topic ${topicId}.`);
        return [];
      }
      
      const collection = this.getTopicFiltersCollection();
      const documents = await collection.find({ topicId }).toArray();
      
      return documents.map(doc => ({
        type: doc.filterType,
        value: doc.value
      }));
    } catch (error) {
      this.logger.error(`Failed to get filters for topic ${topicId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async addTopicFilter(topicId: number, filter: TopicFilter, userId?: number): Promise<void> {
    try {
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot add filter to topic ${topicId}.`);
        return;
      }
      
      const collection = this.getTopicFiltersCollection();
      
      await collection.updateOne(
        {
          topicId,
          filterType: filter.type,
          value: filter.value
        },
        {
          $set: {
            topicId,
            filterType: filter.type,
            value: filter.value,
            createdAt: new Date(),
            createdBy: userId
          }
        },
        { upsert: true }
      );
      
      this.logger.debug(`Filter added to topic ${topicId}: ${filter.type}:${filter.value}`);
    } catch (error) {
      this.logger.error(`Failed to add filter to topic ${topicId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async removeTopicFilter(topicId: number, filter: TopicFilter): Promise<void> {
    try {
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot remove filter from topic ${topicId}.`);
        return;
      }
      
      const collection = this.getTopicFiltersCollection();
      
      await collection.deleteOne({
        topicId,
        filterType: filter.type,
        value: filter.value
      });
      
      this.logger.debug(`Filter removed from topic ${topicId}: ${filter.type}:${filter.value}`);
    } catch (error) {
      this.logger.error(`Failed to remove filter from topic ${topicId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // ===== Monitor state methods =====
  
  async getMonitorState(): Promise<MonitorState | null> {
    try {
      const collection = this.getMonitorStateCollection();
      const doc = await collection.findOne({ type: 'monitorState' });
      
      if (doc) {
        const { _id, type, ...state } = doc;
        return state as MonitorState;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get monitor state:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async saveMonitorState(state: MonitorState): Promise<void> {
    try {
      const collection = this.getMonitorStateCollection();
      
      await collection.updateOne(
        { type: 'monitorState' },
        { $set: { ...state, type: 'monitorState', updatedAt: new Date() } },
        { upsert: true }
      );
      
      this.logger.debug('Monitor state saved successfully');
    } catch (error) {
      this.logger.error('Failed to save monitor state:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // ===== Metrics methods =====
  
  async saveMetricsSnapshot(snapshot: MetricsSnapshot): Promise<void> {
    try {
      const collection = this.getMetricsSnapshotsCollection();
      
      await collection.insertOne({
        ...snapshot,
        createdAt: new Date()
      });
      
      this.logger.debug('Metrics snapshot saved successfully');
      
      // Cleanup old snapshots
      const count = await collection.countDocuments();
      if (count > 1000) { // Keep last 1000 snapshots
        const oldestToKeep = await collection
          .find()
          .sort({ timestamp: -1 })
          .skip(1000)
          .limit(1)
          .toArray();
          
        if (oldestToKeep.length > 0) {
          await collection.deleteMany({
            timestamp: { $lt: oldestToKeep[0].timestamp }
          });
        }
      }
    } catch (error) {
      this.logger.error('Failed to save metrics snapshot:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async getHistoricalMetrics(limit: number = 100): Promise<MetricsSnapshot[]> {
    try {
      const collection = this.getMetricsSnapshotsCollection();
      return await collection
        .find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      this.logger.error('Failed to get historical metrics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // ===== Config methods =====
  
  async getConfig(): Promise<Config | null> {
    try {
      // If MongoDB is not initialized, return null
      if (!this.client || !this.db) {
        this.logger.warn('MongoDB not initialized. Cannot get config.');
        return null;
      }
      
      const collection = this.getConfigCollection();
      const doc = await collection.findOne({ type: 'appConfig' });
      
      if (doc) {
        const { _id, type, ...config } = doc;
        return config as Config;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Failed to get config:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  async saveConfig(config: Config): Promise<void> {
    try {
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn('MongoDB not initialized. Cannot save config.');
        return;
      }
      
      const collection = this.getConfigCollection();
      
      await collection.updateOne(
        { type: 'appConfig' },
        { $set: { ...config, type: 'appConfig', updatedAt: new Date() } },
        { upsert: true }
      );
      
      this.logger.debug('Config saved successfully');
    } catch (error) {
      this.logger.error('Failed to save config:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  // Cleanup methods
  
  async cleanup(maxAgeDays: number = 7): Promise<void> {
    try {
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn('MongoDB not initialized. Cleanup skipped.');
        return;
      }
      
      const collection = this.getTweetsCollection();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      
      const result = await collection.deleteMany({
        'metadata.capturedAt': { $lt: cutoffDate }
      });
      
      this.logger.info(`Cleaned up ${result.deletedCount} old tweets`);
      this.metrics.gauge('storage.tweets_count', await this.getTweetCount());
      this.metrics.increment('storage.tweets_cleaned', result.deletedCount || 0);
    } catch (error) {
      this.metrics.increment('storage.cleanup_failures');
      this.logger.error('Failed to cleanup old tweets:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  private async getTweetCount(): Promise<number> {
    // If MongoDB is not initialized, return 0
    if (!this.client || !this.db) {
      return 0;
    }
    
    const collection = this.getTweetsCollection();
    return await collection.countDocuments();
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
    
    // Reset client and db references
    this.client = null;
    this.db = null;
  }
}