import { connectToDatabase } from '@/lib/mongodb';
import { Tweet, TweetQueryOptions } from '@/types/tweet';

/**
 * Get tweets based on query options
 */
export async function getTweets(options: TweetQueryOptions = {}): Promise<Tweet[]> {
  const { db } = await connectToDatabase();
  const { 
    limit = 20, 
    topicId, 
    sentToTelegram, 
    startDate, 
    endDate,
    searchText 
  } = options;
  
  const query: any = {};
  
  // Apply filters if provided
  if (topicId) query['metadata.topicId'] = topicId;
  if (sentToTelegram !== undefined) query['metadata.sentToTelegram'] = sentToTelegram;
  
  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  
  // Text search
  if (searchText) {
    query.$text = { $search: searchText };
  }
  
  return db
    .collection('tweets')
    .find(query)
    .sort({ 'metadata.capturedAt': -1 })
    .limit(limit)
    .toArray();
}

/**
 * Get a single tweet by ID
 */
export async function getTweetById(id: string): Promise<Tweet | null> {
  const { db } = await connectToDatabase();
  return db.collection('tweets').findOne({ id });
}

/**
 * Get tweet statistics
 */
export async function getTweetStats() {
  const { db } = await connectToDatabase();
  
  // Get tweet counts
  const totalTweets = await db.collection('tweets').countDocuments();
  const sentTweets = await db.collection('tweets').countDocuments({ 'metadata.sentToTelegram': true });
  const rejectedTweets = await db.collection('tweets').countDocuments({ 'metadata.sentToTelegram': false });
  
  // Get topic breakdown
  const topicBreakdown = await db.collection('tweets').aggregate([
    { $match: { 'metadata.sentToTelegram': true } },
    { $group: { _id: '$metadata.topicId', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  // Get rejection reasons
  const rejectionReasons = await db.collection('tweets').aggregate([
    { $match: { 'metadata.sentToTelegram': false } },
    { $group: { _id: '$metadata.rejectionReason', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]).toArray();
  
  return {
    totalTweets,
    sentTweets,
    rejectedTweets,
    topicBreakdown,
    rejectionReasons
  };
}

/**
 * Get historical tweet data for charts
 */
export async function getHistoricalTweetData(days: number = 7) {
  const { db } = await connectToDatabase();
  
  // Calculate start date (n days ago)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  const dailyTweets = await db.collection('tweets').aggregate([
    { 
      $match: { 
        'metadata.capturedAt': { $gte: startDate } 
      } 
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$metadata.capturedAt' } },
          sentToTelegram: '$metadata.sentToTelegram'
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]).toArray();
  
  // Define the chart data interface
  interface ChartDataPoint {
    date: string;
    sent: number;
    rejected: number;
    total: number;
  }

  // Transform data for chart
  const chartData: ChartDataPoint[] = [];
  
  // Extract unique dates and sort them
  const dates: string[] = Array.from(
    new Set(dailyTweets.map((item: any) => item._id.date))
  ).sort() as string[];
  
  dates.forEach((date) => {
    const sent = dailyTweets.find((item: any) => 
      item._id.date === date && item._id.sentToTelegram === true
    )?.count || 0;
    
    const rejected = dailyTweets.find((item: any) => 
      item._id.date === date && item._id.sentToTelegram === false
    )?.count || 0;
    
    chartData.push({
      date,
      sent,
      rejected,
      total: sent + rejected
    });
  });
  
  return chartData;
}
