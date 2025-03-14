import { connectToDatabase } from '@/lib/mongodb';
import { TopicFilter, TopicFilterDocument, FilterQueryOptions } from '@/types/filter';

/**
 * Get filters based on query options
 */
export async function getFilters(options: FilterQueryOptions = {}): Promise<TopicFilterDocument[]> {
  const { db } = await connectToDatabase();
  const { topicId, type } = options;
  
  const query: any = {};
  
  // Apply filters if provided
  if (topicId !== undefined) query.topicId = topicId;
  if (type) query.type = type;
  
  return db
    .collection('topicFilters')
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
}

/**
 * Add a new filter
 */
export async function addFilter(filter: TopicFilter & { topicId: number }): Promise<boolean> {
  const { db } = await connectToDatabase();
  
  try {
    await db.collection('topicFilters').updateOne(
      { 
        topicId: filter.topicId, 
        type: filter.type, 
        value: filter.value 
      },
      { 
        $set: {
          ...filter,
          createdAt: new Date()
        } 
      },
      { upsert: true }
    );
    
    return true;
  } catch (error) {
    console.error('Error adding filter:', error);
    return false;
  }
}

/**
 * Delete a filter
 */
export async function deleteFilter(filter: { topicId: number; type: string; value: string }): Promise<boolean> {
  const { db } = await connectToDatabase();
  
  try {
    const result = await db.collection('topicFilters').deleteOne({
      topicId: filter.topicId,
      type: filter.type,
      value: filter.value
    });
    
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error deleting filter:', error);
    return false;
  }
}

/**
 * Get filter statistics
 */
export async function getFilterStats() {
  const { db } = await connectToDatabase();
  
  // Get filter counts by topic
  const filtersByTopic = await db.collection('topicFilters').aggregate([
    { $group: { _id: '$topicId', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  // Get filter counts by type
  const filtersByType = await db.collection('topicFilters').aggregate([
    { $group: { _id: '$type', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  return {
    filtersByTopic,
    filtersByType,
    totalFilters: await db.collection('topicFilters').countDocuments()
  };
}
