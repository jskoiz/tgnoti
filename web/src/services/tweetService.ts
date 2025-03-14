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
export async function getCompetitorStats() {
  const { db } = await connectToDatabase();
  
  // Define competitor accounts to track
  const competitorAccounts = [
    'tradewithPhoton',
    'bullx_io',
    'tradeonnova',
    'maestrobots',
    'bonkbot_io',
    'gmgnai',
    'bloomtradingbot',
    'trojanonsolana',
    'trojantrading'
  ].map(account => account.toLowerCase()); // Normalize to lowercase for comparison
  
  // Get tweets from competitors (COMPETITOR_TWEETS)
  const tweetsByCompetitor = await db.collection('tweets').aggregate([
    {
      $match: {
        'metadata.topicId': { $in: ['12111', 12111] } // Try both string and number formats
      }
    },
    {
      $group: {
        _id: {
          account: '$tweetBy.userName'
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray();
  
  // Get tweets mentioning competitors (COMPETITOR_MENTIONS)
  const tweetsMentioningCompetitor = await db.collection('tweets').aggregate([
    {
      $match: {
        'metadata.topicId': { $in: ['12110', 12110] } // Try both string and number formats
      }
    },
    {
      $unwind: {
        path: '$entities.mentionedUsers',
        preserveNullAndEmptyArrays: false
      }
    },
    {
      $group: {
        _id: {
          account: '$entities.mentionedUsers'
        },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]).toArray();
  
  console.log('Tweets FROM competitors:', tweetsByCompetitor);
  console.log('Tweets MENTIONING competitors:', tweetsMentioningCompetitor);
  
  // Define types for aggregation results
  interface AggregationResult {
    _id: { account: string };
    count: number;
  }

  interface CompetitorData {
    competitor: string;
    tweets: number;
    mentions: number;
    total: number;
  }

  // Combine the data for the chart
  const combinedData = competitorAccounts.map((competitor: string) => {
    const fromCount = tweetsByCompetitor.find((item: AggregationResult) => 
      item._id.account.toLowerCase() === competitor.toLowerCase()
    )?.count || 0;
    
    const mentionCount = tweetsMentioningCompetitor.find((item: AggregationResult) => 
      item._id.account.toLowerCase() === competitor.toLowerCase()
    )?.count || 0;
    
    return {
      competitor,
      tweets: fromCount,
      mentions: mentionCount,
      total: fromCount + mentionCount
    };
  });
  
  // Sort by total count
  return combinedData.sort((a: CompetitorData, b: CompetitorData) => b.total - a.total);
}

export async function getCompetitorVsTrojanData(days: number = 14) {
  const { db } = await connectToDatabase();
  
  // Calculate start date (n days ago)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  // Define trojan accounts
  const trojanAccounts = [
    'trojanonsolana',
    'trojantrading'
  ].map(account => account.toLowerCase());
  
  // Get tweets by day for trojan and competitors
  const dailyTweets = await db.collection('tweets').aggregate([
    { 
      $match: { 
        'metadata.capturedAt': { $gte: startDate },
        'metadata.topicId': { $in: ['12110', '12111', 12110, 12111] } // Both competitor tweets and mentions
      } 
    },
    {
      $addFields: {
        // Check if the tweet is from or mentions a trojan account
        isTrojan: {
          $cond: {
            if: {
              $or: [
                { $in: [{ $toLower: "$tweetBy.userName" }, trojanAccounts] },
                {
                  $anyElementTrue: {
                    $map: {
                      input: { $ifNull: ["$entities.mentionedUsers", []] },
                      as: "mentionedUser",
                      in: { $in: [{ $toLower: "$$mentionedUser" }, trojanAccounts] }
                    }
                  }
                }
              ]
            },
            then: true,
            else: false
          }
        },
        // Format date for grouping
        dateString: { $dateToString: { format: '%Y-%m-%d', date: '$metadata.capturedAt' } }
      }
    },
    {
      $group: {
        _id: {
          date: "$dateString",
          isTrojan: "$isTrojan"
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1 } }
  ]).toArray();
  
  // Transform data for chart
  const dates = Array.from(
    new Set(dailyTweets.map((item: any) => item._id.date))
  ).sort();
  
  const chartData = dates.map((date) => {
    const trojanCount = dailyTweets.find((item: any) => 
      item._id.date === date && item._id.isTrojan === true
    )?.count || 0;
    
    const competitorCount = dailyTweets.find((item: any) => 
      item._id.date === date && item._id.isTrojan === false
    )?.count || 0;
    
    return {
      date,
      Trojan: trojanCount,
      Competitors: competitorCount
    };
  });
  
  return chartData;
}

export async function getTopUsersByTweetVolume(limit: number = 10) {
  const { db } = await connectToDatabase();
  
  // Get users with the most tweets
  const topUsers = await db.collection('tweets').aggregate([
    {
      $match: {
        'metadata.sentToTelegram': true // Only count tweets that were sent to Telegram
      }
    },
    {
      $group: {
        _id: {
          userId: '$tweetBy.id',
          userName: '$tweetBy.userName',
          name: '$tweetBy.name',
          profileImageUrl: '$tweetBy.profileImageUrl'
        },
        tweetCount: { $sum: 1 },
        // Sum up engagement metrics
        totalLikes: { 
          $sum: { $ifNull: ['$engagement.likeCount', 0] } 
        },
        totalRetweets: { 
          $sum: { $ifNull: ['$engagement.retweetCount', 0] } 
        },
        totalReplies: { 
          $sum: { $ifNull: ['$engagement.replyCount', 0] } 
        }
      }
    },
    {
      $project: {
        _id: 0,
        userId: '$_id.userId',
        userName: '$_id.userName',
        name: '$_id.name',
        profileImageUrl: '$_id.profileImageUrl',
        tweets: '$tweetCount',
        likes: '$totalLikes',
        retweets: '$totalRetweets',
        replies: '$totalReplies',
        totalEngagement: { 
          $add: ['$totalLikes', '$totalRetweets', '$totalReplies'] 
        }
      }
    },
    {
      $sort: { tweets: -1 }
    },
    {
      $limit: limit
    }
  ]).toArray();
  
  return topUsers;
}

export async function getNotableUsersByFollowingCount(limit: number = 10) {
  const { db } = await connectToDatabase();
  
  // Get users with the highest follower counts
  const notableUsers = await db.collection('tweets').aggregate([
    {
      $match: {
        'metadata.sentToTelegram': true // Only count tweets that were sent to Telegram
      }
    },
    {
      $group: {
        _id: {
          userId: '$tweetBy.id',
          userName: '$tweetBy.userName',
          name: '$tweetBy.name',
          profileImageUrl: '$tweetBy.profileImageUrl',
          verified: { $ifNull: ['$tweetBy.verified', false] }
        },
        // Use max to get the highest follower count (in case it changes over time)
        followerCount: { 
          $max: { $ifNull: ['$tweetBy.followersCount', 0] } 
        },
        tweetCount: { $sum: 1 },
        // Sum up engagement metrics
        totalEngagement: { 
          $sum: { 
            $add: [
              { $ifNull: ['$engagement.likeCount', 0] },
              { $ifNull: ['$engagement.retweetCount', 0] },
              { $ifNull: ['$engagement.replyCount', 0] }
            ] 
          } 
        }
      }
    },
    {
      $project: {
        _id: 0,
        userId: '$_id.userId',
        userName: '$_id.userName',
        name: '$_id.name',
        profileImageUrl: '$_id.profileImageUrl',
        verified: '$_id.verified',
        followers: '$followerCount',
        tweets: '$tweetCount',
        totalEngagement: '$totalEngagement',
        engagementPerTweet: { 
          $divide: ['$totalEngagement', { $max: ['$tweetCount', 1] }] 
        }
      }
    },
    {
      $sort: { followers: -1 }
    },
    {
      $limit: limit
    }
  ]).toArray();
  
  return notableUsers;
}

export async function getEngagementOverTime(days: number = 14) {
  const { db } = await connectToDatabase();
  
  // Calculate start date (n days ago)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  
  // Get engagement metrics by day
  const dailyEngagement = await db.collection('tweets').aggregate([
    { 
      $match: { 
        'metadata.capturedAt': { $gte: startDate },
        'metadata.sentToTelegram': true // Only count tweets that were sent to Telegram
      } 
    },
    {
      $addFields: {
        // Format date for grouping
        dateString: { $dateToString: { format: '%Y-%m-%d', date: '$metadata.capturedAt' } }
      }
    },
    {
      $group: {
        _id: "$dateString",
        retweets: { $sum: { $ifNull: ['$engagement.retweetCount', 0] } },
        likes: { $sum: { $ifNull: ['$engagement.likeCount', 0] } },
        replies: { $sum: { $ifNull: ['$engagement.replyCount', 0] } }
      }
    },
    { $sort: { '_id': 1 } }
  ]).toArray();
  
  // Transform data for chart
  const chartData = dailyEngagement.map((item: any) => ({
    date: item._id,
    retweets: item.retweets,
    likes: item.likes,
    replies: item.replies
  }));
  
  return chartData;
}

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
