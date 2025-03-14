import { connectToDatabase } from '@/lib/mongodb';
import { Topic, TopicQueryOptions } from '@/types/topic';

/**
 * Get topics based on query options
 */
export async function getTopics(options: TopicQueryOptions = {}): Promise<Topic[]> {
  const { db } = await connectToDatabase();
  const { isActive } = options;
  
  const query: any = {};
  
  // Apply filters if provided
  if (isActive !== undefined) query.isActive = isActive;
  
  return db
    .collection('topics')
    .find(query)
    .sort({ id: 1 })
    .toArray();
}

/**
 * Get a single topic by ID
 */
export async function getTopicById(id: number): Promise<Topic | null> {
  const { db } = await connectToDatabase();
  return db.collection('topics').findOne({ id });
}

/**
 * Get topic statistics
 */
export async function getTopicStats() {
  const { db } = await connectToDatabase();
  
  // Get active vs inactive topics
  const activeTopics = await db.collection('topics').countDocuments({ isActive: true });
  const inactiveTopics = await db.collection('topics').countDocuments({ isActive: false });
  
  // Get tweet counts by topic
  const tweetsByTopic = await db.collection('tweets').aggregate([
    { $match: { 'metadata.sentToTelegram': true } },
    { $group: { _id: '$metadata.topicId', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  // Get filter counts by topic
  const filtersByTopic = await db.collection('topicFilters').aggregate([
    { $group: { _id: '$topicId', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  // Define types for aggregation results
  interface AggregationResult {
    _id: string | number;
    count: number;
  }

  // Join topic data with tweet and filter counts
  const topics = await getTopics();
  const topicsWithStats = topics.map(topic => {
    const tweetCount = tweetsByTopic.find((item: AggregationResult) => 
      item._id === topic.id.toString())?.count || 0;
    const filterCount = filtersByTopic.find((item: AggregationResult) => 
      item._id === topic.id)?.count || 0;
    
    return {
      ...topic,
      tweetCount,
      filterCount
    };
  });
  
  return {
    activeTopics,
    inactiveTopics,
    totalTopics: topics.length,
    topicsWithStats
  };
}
