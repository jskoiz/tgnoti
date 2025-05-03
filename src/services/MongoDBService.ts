import { injectable, inject } from 'inversify';
import { MongoClient, Collection, Db } from 'mongodb';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigService } from './ConfigService.js';
import { TweetDocument, TopicFilterDocument, MongoConfig } from '../types/mongodb.js';
import { Tweet } from '../types/twitter.js';
import { TopicFilter } from '../types/topics.js';
import { AffiliateDocument, Affiliate, AffiliateChange } from '../types/affiliates.js';
import { MonitorState, MetricsSnapshot } from '../types/monitoring-enhanced.js';
import { MetricsManager } from '../core/monitoring/MetricsManager.js';
import { Config } from '../types/storage.js';
import { MongoDataValidator } from '../utils/mongoDataValidator.js';

@injectable()
export class MongoDBService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private validator: MongoDataValidator;
  
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigService) private configService: ConfigService,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager,
    @inject(TYPES.MongoDataValidator) private dataValidator: MongoDataValidator
  ) {
    this.logger.setComponent('MongoDBService');
    this.validator = dataValidator;
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
      
      // Ensure affiliates collection exists
      if (!collectionNames.includes(config.collections.affiliates)) {
        await this.db.createCollection(config.collections.affiliates);
        this.logger.info(`Created collection: ${config.collections.affiliates}`);
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
        { key: { id: 1 }, unique: true, name: 'idx_tweet_id' },
        { key: { 'metadata.topicId': 1 }, unique: false, name: 'idx_topic_id' },
        { key: { 'metadata.capturedAt': 1 }, unique: false, name: 'idx_captured_at' },
        { key: { 'processingStatus.isAnalyzed': 1 }, unique: false, name: 'idx_is_analyzed' },
        { key: { text: "text" }, unique: false, name: 'idx_text_search' },
        // Optimized indexes for common queries
        { key: { 'tweetBy.userName': 1 }, unique: false, name: 'idx_username' },
        { key: { 'metadata.capturedAt': -1, id: -1 }, unique: false, name: 'idx_recent_tweets' },
        { key: { 'processingStatus.isAnalyzed': 1, 'processingStatus.attempts': 1 }, unique: false, name: 'idx_processing_status' }
      ]);
      
      // Create indexes for topic filters collection
      const topicFiltersCollection = this.getTopicFiltersCollection();
      await topicFiltersCollection.createIndexes([
        { key: { topicId: 1, filterType: 1, value: 1 }, unique: true, name: 'idx_unique_filter' },
        { key: { topicId: 1 }, unique: false, name: 'idx_topic_filters' },
        { key: { filterType: 1, value: 1 }, unique: false, name: 'idx_filter_lookup' }
      ]);

      // Create indexes for monitor state collection
      const monitorStateCollection = this.getMonitorStateCollection();
      await monitorStateCollection.createIndex({ type: 1 }, { unique: true, name: 'idx_monitor_state_type' });

      // Create indexes for metrics snapshots collection
      const metricsSnapshotsCollection = this.getMetricsSnapshotsCollection();
      await metricsSnapshotsCollection.createIndexes([
        { key: { timestamp: 1 }, unique: false, name: 'idx_metrics_timestamp_asc' },
        { key: { timestamp: -1 }, unique: false, name: 'idx_metrics_timestamp_desc' }
      ]);

      // Create index for config collection
      const configCollection = this.getConfigCollection();
      await configCollection.createIndex({ type: 1 }, { unique: true, name: 'idx_config_type' });
      
      // Create indexes for affiliates collection
      const affiliatesCollection = this.getAffiliatesCollection();
      await affiliatesCollection.createIndexes([
        { key: { userId: 1 }, unique: true, name: 'idx_affiliate_user_id' },
        { key: { userName: 1 }, unique: false, name: 'idx_affiliate_user_name' },
        { key: { lastChecked: 1 }, unique: false, name: 'idx_affiliate_last_checked' }
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
  
  private getAffiliatesCollection(): Collection<AffiliateDocument> {
    if (!this.db) throw new Error('Database not initialized');
    
    // If MongoDB is not initialized, throw a more specific error
    if (!this.client) throw new Error('MongoDB client not initialized. Check your MongoDB URI.');
    
    const config = this.configService.getMongoDBConfig();
    return this.db.collection<AffiliateDocument>(config.collections.affiliates);
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

      // Validate the tweet document
      const validation = this.validator.validateTweet(doc);
      if (!validation.isValid) {
        this.logger.warn(`Tweet ${tweet.id} failed validation: ${validation.errors.join(', ')}`);
        this.logger.debug('Invalid tweet:', doc);
        this.metrics.increment('mongodb.tweets.validation_failures');
        const errorMessage = `Tweet validation failed: ${validation.errors.join(', ')}`;
        throw new Error(errorMessage);
      }
      
      const collection = this.getTweetsCollection();
      
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
      this.logger.info(`addTopicFilter called with: topicId=${topicId}, filter=${JSON.stringify(filter)}, userId=${userId}`);
      
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot add filter to topic ${topicId}.`);
        return;
      }

      // Create filter document
      const filterDoc: TopicFilterDocument = {
        topicId,
        filterType: filter.type,
        value: filter.value,
        createdAt: new Date(),
        createdBy: userId
      };
      
      this.logger.info(`Created filter document: ${JSON.stringify(filterDoc)}`);

      // Validate the filter document
      const validation = this.validator.validateTopicFilter(filterDoc);
      this.logger.info(`Filter validation result: ${JSON.stringify(validation)}`);
      
      if (!validation.isValid) {
        this.logger.warn(`Filter for topic ${topicId} failed validation: ${validation.errors.join(', ')}`);
        this.logger.debug('Invalid filter:', filterDoc);
        this.metrics.increment('mongodb.filters.validation_failures');
        const errorMessage = `Filter validation failed: ${validation.errors.join(', ')}`;
        throw new Error(errorMessage);
      }
      
      const collection = this.getTopicFiltersCollection();
      
      const query = {
        topicId,
        filterType: filter.type,
        value: filter.value
      };
      
      const update = {
        $set: {
          topicId,
          filterType: filter.type,
          value: filter.value,
          createdAt: new Date(),
          createdBy: userId
        }
      };
      
      this.logger.info(`MongoDB query for filter addition: ${JSON.stringify(query)}`);
      this.logger.info(`MongoDB update for filter addition: ${JSON.stringify(update)}`);
      
      const result = await collection.updateOne(query, update, { upsert: true });
      
      this.logger.info(`Filter addition result: ${JSON.stringify({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
        upsertedId: result.upsertedId
      })}`);
      
      this.logger.debug(`Filter added to topic ${topicId}: ${filter.type}:${filter.value}`);
    } catch (error) {
      this.logger.error(`Failed to add filter to topic ${topicId}:`, error instanceof Error ? error : new Error(String(error)));
      this.logger.error(`Filter details: type=${filter.type}, value=${filter.value}`);
      throw error;
    }
  }
  
  async removeTopicFilter(topicId: number, filter: TopicFilter): Promise<void> {
    try {
      this.logger.debug(`removeTopicFilter called with: topicId=${topicId}, filter=${JSON.stringify(filter)}`);
      
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot remove filter from topic ${topicId}.`);
        return;
      }
      
      const collection = this.getTopicFiltersCollection();
      
      const query = {
        topicId,
        filterType: filter.type,
        value: filter.value
      };
      
      this.logger.debug(`MongoDB query for filter removal: ${JSON.stringify(query)}`);
      
      const result = await collection.deleteOne(query);
      
      if (result.deletedCount === 0) {
        this.logger.warn(`No filter found to remove: topicId=${topicId}, type=${filter.type}, value=${filter.value}`);
      } else {
        this.logger.debug(`Filter removed from topic ${topicId}: ${filter.type}:${filter.value} (deletedCount: ${result.deletedCount})`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove filter from topic ${topicId}:`, error instanceof Error ? error : new Error(String(error)));
      this.logger.error(`Filter details: type=${filter.type}, value=${filter.value}`);
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
      // Validate the monitor state
      const validation = this.validator.validateMonitorState(state);
      if (!validation.isValid) {
        this.logger.warn(`Monitor state failed validation: ${validation.errors.join(', ')}`);
        this.logger.debug('Invalid state:', state);
        this.metrics.increment('mongodb.state.validation_failures');
        const errorMessage = `Monitor state validation failed: ${validation.errors.join(', ')}`;
        throw new Error(errorMessage);
      }

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
      // Validate the metrics snapshot
      const validation = this.validator.validateMetricsSnapshot(snapshot);
      if (!validation.isValid) {
        this.logger.warn(`Metrics snapshot failed validation: ${validation.errors.join(', ')}`);
        this.logger.debug('Invalid snapshot:', snapshot);
        this.metrics.increment('mongodb.metrics.validation_failures');
        const errorMessage = `Metrics snapshot validation failed: ${validation.errors.join(', ')}`;
        throw new Error(errorMessage);
      }

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

      // Basic validation for config
      if (!config) {
        throw new Error('Config object is required');
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

      // Validate maxAgeDays
      if (maxAgeDays <= 0) {
        this.logger.warn(`Invalid maxAgeDays value: ${maxAgeDays}, using default of 7`);
        maxAgeDays = 7;
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

  /**
   * Performs data integrity checks on the MongoDB collections
   * @returns An object containing check results and any issues found
   */
  async checkDataIntegrity(): Promise<{ isValid: boolean; issues: string[] }> {
    try {
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn('MongoDB not initialized. Data integrity check skipped.');
        return { isValid: true, issues: ['MongoDB not initialized, check skipped'] };
      }

      const config = this.configService.getMongoDBConfig();
      return await this.validator.checkDataIntegrity(this.db, config.collections);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to check data integrity:', err);
      return { 
        isValid: false, 
        issues: [`Error during integrity check: ${err.message}`] 
      };
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
  
  // ===== Affiliate methods =====
  
  /**
   * Get affiliates for a specific Twitter user
   * @param userId The Twitter user ID
   * @returns The affiliate document or null if not found
   */
  async getAffiliates(userId: string): Promise<AffiliateDocument | null> {
    try {
      // If MongoDB is not initialized, return null
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot get affiliates for user ${userId}.`);
        return null;
      }
      
      const collection = this.getAffiliatesCollection();
      return await collection.findOne({ userId });
    } catch (error) {
      this.logger.error(`Failed to get affiliates for user ${userId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * Get affiliates for a Twitter user by username
   * @param userName The Twitter username
   * @returns The affiliate document or null if not found
   */
  async getAffiliatesByUsername(userName: string): Promise<AffiliateDocument | null> {
    try {
      // If MongoDB is not initialized, return null
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Cannot get affiliates for username ${userName}.`);
        return null;
      }
      
      const collection = this.getAffiliatesCollection();
      return await collection.findOne({ userName: userName.toLowerCase() });
    } catch (error) {
      this.logger.error(`Failed to get affiliates for username ${userName}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * Save affiliates for a Twitter user
   * @param userId The Twitter user ID
   * @param userName The Twitter username
   * @param affiliates The list of affiliates
   * @returns An array of affiliate changes (added or removed)
   */
  async saveAffiliates(userId: string, userName: string, affiliates: Affiliate[]): Promise<AffiliateChange[]> {
    try {
      const startTime = Date.now();
      
      // If MongoDB is not initialized, log a warning and return
      if (!this.client || !this.db) {
        this.logger.warn(`MongoDB not initialized. Affiliates for user ${userId} not saved.`);
        return [];
      }
      
      const collection = this.getAffiliatesCollection();
      const now = new Date();
      
      // Get existing document if any
      const existingDoc = await collection.findOne({ userId });
      let changes: AffiliateChange[] = [];
      
      if (existingDoc) {
        // Update existing affiliates
        changes = this.detectAffiliateChanges(existingDoc.affiliates, affiliates);
        
        // Process the changes to update the affiliates array
        const updatedAffiliates = this.mergeAffiliates(existingDoc.affiliates, affiliates, changes);
        
        await collection.updateOne(
          { userId },
          {
            $set: {
              affiliates: updatedAffiliates,
              lastChecked: now,
              userName: userName.toLowerCase() // Update username in case it changed
            }
          }
        );
        
        this.logger.info(`Updated affiliates for user ${userId} (${userName}), found ${changes.length} changes`);
      } else {
        // Create new document
        const newDoc: AffiliateDocument = {
          userId,
          userName: userName.toLowerCase(),
          affiliates: affiliates.map(a => ({
            ...a,
            addedAt: now,
            isActive: true
          })),
          lastChecked: now,
          metadata: {
            source: 'twitter_api',
            capturedAt: now,
            version: 1
          }
        };
        
        await collection.insertOne(newDoc);
        
        // All affiliates are new
        changes = affiliates.map(affiliate => ({
          type: 'added',
          affiliate,
          timestamp: now
        }));
        
        this.logger.info(`Created new affiliates document for user ${userId} (${userName}) with ${affiliates.length} affiliates`);
      }
      
      this.metrics.timing('mongodb.affiliates.save_duration', Date.now() - startTime);
      return changes;
    } catch (error) {
      this.logger.error(`Failed to save affiliates for user ${userId}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * Get all tracked affiliate accounts
   * @returns Array of affiliate documents
   */
  async getAllAffiliateAccounts(): Promise<AffiliateDocument[]> {
    try {
      // If MongoDB is not initialized, return empty array
      if (!this.client || !this.db) {
        this.logger.warn('MongoDB not initialized. Cannot get affiliate accounts.');
        return [];
      }
      
      const collection = this.getAffiliatesCollection();
      return await collection.find().toArray();
    } catch (error) {
      this.logger.error('Failed to get all affiliate accounts:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  
  /**
   * Detect changes between existing and current affiliates
   * @param existing Existing affiliates from the database
   * @param current Current affiliates from the API
   * @returns Array of affiliate changes
   */
  private detectAffiliateChanges(
    existing: AffiliateDocument['affiliates'],
    current: Affiliate[]
  ): AffiliateChange[] {
    const changes: AffiliateChange[] = [];
    const now = new Date();
    
    // Find removed affiliates (in existing but not in current)
    // Create a map of userIds to userNames for case-insensitive comparison
    const currentUserMap = new Map<string, string>();
    current.forEach(a => {
      currentUserMap.set(a.userId.toLowerCase(), a.userName.toLowerCase());
    });
    
    const removedAffiliates = existing
      .filter(a => a.isActive && !currentUserMap.has(a.userId.toLowerCase()));
    
    for (const affiliate of removedAffiliates) {
      changes.push({
        type: 'removed',
        affiliate: {
          userId: affiliate.userId,
          userName: affiliate.userName,
          fullName: affiliate.fullName,
          followersCount: affiliate.followersCount,
          followingsCount: affiliate.followingsCount,
          isVerified: affiliate.isVerified
        },
        timestamp: now
      });
    }
    
    // Find added affiliates (in current but not in existing or not active)
    // Create a map of userIds to userNames for case-insensitive comparison
    const existingUserMap = new Map<string, string>();
    existing.filter(a => a.isActive).forEach(a => {
      existingUserMap.set(a.userId.toLowerCase(), a.userName.toLowerCase());
    });
    
    const addedAffiliates = current.filter(a => !existingUserMap.has(a.userId.toLowerCase()));
    
    for (const affiliate of addedAffiliates) {
      changes.push({
        type: 'added',
        affiliate,
        timestamp: now
      });
    }
    
    return changes;
  }
  
  /**
   * Merge existing affiliates with current affiliates, applying changes
   * @param existing Existing affiliates from the database
   * @param current Current affiliates from the API
   * @param changes Detected changes
   * @returns Updated affiliates array
   */
  private mergeAffiliates(
    existing: AffiliateDocument['affiliates'],
    current: Affiliate[],
    changes: AffiliateChange[]
  ): AffiliateDocument['affiliates'] {
    const now = new Date();
    const result = [...existing]; // Clone the existing array
    
    // Process removals
    const removedIds = changes
      .filter(c => c.type === 'removed')
      .map(c => c.affiliate.userId);
    
    for (const affiliate of result) {
      // Case-insensitive comparison for user IDs
      if (removedIds.some(id => id.toLowerCase() === affiliate.userId.toLowerCase()) && affiliate.isActive) {
        affiliate.isActive = false;
        affiliate.removedAt = now;
      }
    }
    
    // Process additions
    const addedChanges = changes.filter(c => c.type === 'added');
    for (const change of addedChanges) {
      // Check if this affiliate was previously tracked but inactive
      // Use case-insensitive comparison for user IDs
      const existingIndex = result.findIndex(a =>
        a.userId.toLowerCase() === change.affiliate.userId.toLowerCase());
      
      if (existingIndex >= 0) {
        // Update existing record
        result[existingIndex] = {
          ...change.affiliate,
          addedAt: now,
          isActive: true
        };
      } else {
        // Add new record
        result.push({
          ...change.affiliate,
          addedAt: now,
          isActive: true
        });
      }
    }
    
    return result;
  }
}