import { MongoDBService } from '../src/services/MongoDBService.js';
import { MongoClient, Collection, Db } from 'mongodb';
import dotenv from 'dotenv';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

/**
 * Interface for topic name mapping
 */
interface TopicNameMap {
  [key: string]: string;
}

/**
 * Interface for topic breakdown
 */
export interface TopicBreakdown {
  topicId: string;
  topicName: string;
  count: number;
  percentage: number;
}

/**
 * Interface for user breakdown
 */
export interface UserBreakdown {
  username: string;
  count: number;
  percentage: number;
}

/**
 * Interface for month breakdown
 */
export interface MonthBreakdown {
  month: string;
  year: number;
  count: number;
  percentage: number;
}

/**
 * Interface for sentiment breakdown
 */
export interface SentimentBreakdown {
  label: string;
  count: number;
  percentage: number;
}

/**
 * Interface for competitor statistics
 */
export interface CompetitorStat {
  account: string;
  type: 'FROM' | 'MENTIONED';
  count: number;
  percentage: number;
}

/**
 * Interface for tweet analysis results
 */
export interface TweetAnalysisResults {
  totalTweets: number;
  topicBreakdown: TopicBreakdown[];
  userBreakdown: UserBreakdown[];
  monthBreakdown: MonthBreakdown[];
  sentimentBreakdown?: SentimentBreakdown[];
  competitorStats: CompetitorStat[];
}

// Topic names mapping
const TOPIC_NAMES: TopicNameMap = {
  '12111': 'COMPETITOR_TWEETS',
  '12110': 'COMPETITOR_MENTIONS',
  '381': 'TROJAN',
  '6531': 'KOL_MONITORING',
  // Additional topics found in the database
  '5572': 'TOPIC_5572',
  '5573': 'TOPIC_5573',
  '5574': 'TOPIC_5574',
  '6314': 'TOPIC_6314',
  '6317': 'TOPIC_6317',
  '6320': 'TOPIC_6320',
  '6355': 'TOPIC_6355'
};

/**
 * Run tweet analysis and return structured results
 * @param mongoDBService MongoDB service instance
 * @returns Promise with tweet analysis results
 */
export async function runTweetAnalysis(mongoDBService: MongoDBService): Promise<TweetAnalysisResults> {
  console.log(chalk.blue('Running tweet analysis...'));
  
  // Initialize results object
  const results: TweetAnalysisResults = {
    totalTweets: 0,
    topicBreakdown: [],
    userBreakdown: [],
    monthBreakdown: [],
    competitorStats: []
  };
  
  try {
    // Connect to MongoDB directly using the connection string from environment
    const mongoUri = process.env.MONGO_DB_STRING;
    if (!mongoUri) {
      throw new Error('MongoDB connection string not found in environment variables');
    }
    
    const client = new MongoClient(mongoUri);
    await client.connect();
    
    // Use database name from environment variables or default to 'twitter_notifications'
    const dbName = process.env.DB_NAME || 'twitter_notifications';
    console.log(chalk.blue(`Using database: ${dbName}`));
    
    const db = client.db(dbName);
    
    // Use collection names from environment variables or default to 'tweets'
    const tweetsCollectionName = process.env.TWEETS_COLLECTION || 'tweets';
    console.log(chalk.blue(`Using collection: ${tweetsCollectionName}`));
    
    const tweetsCollection = db.collection(tweetsCollectionName);
    
    // Get total tweet count
    results.totalTweets = await tweetsCollection.countDocuments();
    console.log(chalk.blue(`\nTotal tweets in database: ${chalk.bold(results.totalTweets.toString())}`));
    
    // Get breakdown by topic
    console.log(chalk.blue('\nBreakdown by topic:'));
    
    // Aggregate tweets by topicId
    const topicBreakdown = await tweetsCollection.aggregate([
      {
        $group: {
          _id: '$metadata.topicId',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();
    
    // Process topic breakdown
    for (const topic of topicBreakdown) {
      const topicId = topic._id as string;
      const count = topic.count as number;
      const percentage = ((count / results.totalTweets) * 100);
      const topicName = TOPIC_NAMES[topicId] || 'Unknown';
      
      results.topicBreakdown.push({
        topicId,
        topicName,
        count,
        percentage
      });
    }
    
    // Get breakdown by user (top 10)
    console.log(chalk.blue('\nTop 10 users by tweet count:'));
    
    const userBreakdown = await tweetsCollection.aggregate([
      {
        $group: {
          _id: '$tweetBy.userName',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]).toArray();
    
    // Process user breakdown
    for (const user of userBreakdown) {
      const username = user._id as string;
      const count = user.count as number;
      const percentage = ((count / results.totalTweets) * 100);
      
      results.userBreakdown.push({
        username,
        count,
        percentage
      });
    }
    
    // Get breakdown by month
    console.log(chalk.blue('\nTweet count by month:'));
    
    const monthBreakdown = await tweetsCollection.aggregate([
      {
        $addFields: {
          createdDate: { $toDate: '$createdAt' }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdDate' },
            month: { $month: '$createdDate' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]).toArray();
    
    // Process month breakdown
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const entry of monthBreakdown) {
      const year = entry._id.year as number;
      const monthIndex = (entry._id.month as number) - 1;
      const month = months[monthIndex];
      const count = entry.count as number;
      const percentage = ((count / results.totalTweets) * 100);
      
      results.monthBreakdown.push({
        month,
        year,
        count,
        percentage
      });
    }
    
    // Get sentiment breakdown if available
    const hasSentiment = await tweetsCollection.countDocuments({ 'sentiment': { $exists: true } });
    
    if (hasSentiment > 0) {
      console.log(chalk.blue('\nSentiment breakdown:'));
      
      const sentimentBreakdown = await tweetsCollection.aggregate([
        {
          $match: { 'sentiment': { $exists: true } }
        },
        {
          $group: {
            _id: '$sentiment.label',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]).toArray();
      
      // Process sentiment breakdown
      results.sentimentBreakdown = [];
      for (const sentiment of sentimentBreakdown) {
        const label = (sentiment._id as string) || 'Unknown';
        const count = sentiment.count as number;
        const percentage = ((count / hasSentiment) * 100);
        
        results.sentimentBreakdown.push({
          label,
          count,
          percentage
        });
      }
    }
    
    // Get breakdown by competitor accounts
    console.log(chalk.blue('\nBreakdown by competitor accounts:'));
    
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
    const tweetsByCompetitor = await tweetsCollection.aggregate([
      {
        $match: {
          'metadata.topicId': '12111'
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
    const tweetsMentioningCompetitor = await tweetsCollection.aggregate([
      {
        $match: {
          'metadata.topicId': '12110'
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
    
    // Combine results
    const competitorStats: CompetitorStat[] = [];
    
    // Add tweets by competitors
    for (const item of tweetsByCompetitor) {
      const account = (item._id.account as string).toLowerCase();
      if (competitorAccounts.includes(account)) {
        competitorStats.push({
          account: account, // Use lowercase for consistent display
          type: 'FROM',
          count: item.count as number,
          percentage: 0 // Will calculate after getting total
        });
      }
    }
    
    // Add tweets mentioning competitors
    for (const item of tweetsMentioningCompetitor) {
      const account = (item._id.account as string).toLowerCase();
      if (competitorAccounts.includes(account)) {
        competitorStats.push({
          account: account, // Use lowercase for consistent display
          type: 'MENTIONED',
          count: item.count as number,
          percentage: 0 // Will calculate after getting total
        });
      }
    }
    
    // Sort by count descending
    competitorStats.sort((a, b) => b.count - a.count);
    
    // Calculate total competitor-related tweets
    const totalCompetitorTweets = competitorStats.reduce((sum, stat) => sum + stat.count, 0);
    
    // Calculate percentages
    for (const stat of competitorStats) {
      stat.percentage = ((stat.count / totalCompetitorTweets) * 100);
    }
    
    results.competitorStats = competitorStats;
    
    console.log(chalk.green('\nAnalysis complete!'));
    
    // Close the MongoDB connection
    await client.close();
    
    return results;
    
  } catch (error) {
    console.error(chalk.red('Error running analysis:'), error);
    throw error;
  }
}
