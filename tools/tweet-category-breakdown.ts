import { MongoClient } from 'mongodb';
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
 * Interface for OpenWeather API response
 */
interface OpenWeatherResponse {
  main: {
    temp: number;
    humidity: number;
  };
  weather: [{ description: string }];
  wind: { speed: number };
  dt_txt?: string;
}

/**
 * Interface for competitor statistics
 */
interface CompetitorStat {
  account: string;
  type: 'FROM' | 'MENTIONED';
  count: number;
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
 * Main function to connect to MongoDB and analyze tweet data
 */
async function main(): Promise<void> {
  // Get MongoDB connection string from environment variables
  const mongoUri = process.env.MONGO_DB_STRING;
  
  if (!mongoUri) {
    console.error(chalk.red('Error: MongoDB connection string not found in environment variables.'));
    console.error(chalk.yellow('Please make sure MONGO_DB_STRING is set in your .env file.'));
    process.exit(1);
  }

  console.log(chalk.blue('Connecting to MongoDB...'));
  
  let client: MongoClient | undefined;
  try {
    client = new MongoClient(mongoUri);
    await client.connect();
    console.log(chalk.green('Connected to MongoDB successfully!'));
    
    // Use database name from connection string or default to 'twitter_notifications'
    const dbName = process.env.DB_NAME || 'twitter_notifications';
    console.log(chalk.blue(`Using database: ${dbName}`));
    
    const db = client.db(dbName);
    
    // Use collection names from environment variables or default to 'tweets'
    const tweetsCollectionName = process.env.TWEETS_COLLECTION || 'tweets';
    console.log(chalk.blue(`Using collection: ${tweetsCollectionName}`));
    
    const tweetsCollection = db.collection(tweetsCollectionName);
    
    // Get total tweet count
    const totalTweets = await tweetsCollection.countDocuments();
    console.log(chalk.blue(`\nTotal tweets in database: ${chalk.bold(totalTweets.toString())}`));
    
    // Get breakdown by topic
    console.log(chalk.blue('\nBreakdown by topic:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`${chalk.bold('Topic ID'.padEnd(10))} | ${chalk.bold('Topic Name'.padEnd(20))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(50)));
    
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
    
    // Display results
    for (const topic of topicBreakdown) {
      const topicId = topic._id as string;
      const count = topic.count as number;
      const percentage = ((count / totalTweets) * 100).toFixed(2);
      const topicName = TOPIC_NAMES[topicId] || 'Unknown';
      
      console.log(
        `${chalk.cyan(topicId.padEnd(10))} | ${chalk.yellow(topicName.padEnd(20))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
      );
    }
    
    // Get breakdown by user (top 10)
    console.log(chalk.blue('\nTop 10 users by tweet count:'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray(`${chalk.bold('Username'.padEnd(20))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(50)));
    
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
    
    // Display results
    for (const user of userBreakdown) {
      const username = user._id as string;
      const count = user.count as number;
      const percentage = ((count / totalTweets) * 100).toFixed(2);
      
      console.log(
        `${chalk.cyan(username.padEnd(20))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
      );
    }
    
    // Get breakdown by month
    console.log(chalk.blue('\nTweet count by month:'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.gray(`${chalk.bold('Month'.padEnd(15))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(40)));
    
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
    
    // Display results
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (const entry of monthBreakdown) {
      const year = entry._id.year as number;
      const month = months[(entry._id.month as number) - 1];
      const monthYear = `${month} ${year}`;
      const count = entry.count as number;
      const percentage = ((count / totalTweets) * 100).toFixed(2);
      
      console.log(
        `${chalk.cyan(monthYear.padEnd(15))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
      );
    }
    
    // Get sentiment breakdown if available
    const hasSentiment = await tweetsCollection.countDocuments({ 'sentiment': { $exists: true } });
    
    if (hasSentiment > 0) {
      console.log(chalk.blue('\nSentiment breakdown:'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(chalk.gray(`${chalk.bold('Sentiment'.padEnd(15))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
      console.log(chalk.gray('─'.repeat(40)));
      
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
      
      // Display results
      for (const sentiment of sentimentBreakdown) {
        const label = (sentiment._id as string) || 'Unknown';
        const count = sentiment.count as number;
        const percentage = ((count / hasSentiment) * 100).toFixed(2);
        
        let sentimentColor;
        switch (label) {
          case 'positive':
            sentimentColor = chalk.green;
            break;
          case 'negative':
            sentimentColor = chalk.red;
            break;
          case 'neutral':
            sentimentColor = chalk.blue;
            break;
          default:
            sentimentColor = chalk.gray;
            break;
        }
        
        console.log(
          `${sentimentColor(label.padEnd(15))} | ${chalk.green(count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
        );
      }
    }
    
    // Get breakdown by competitor accounts
    console.log(chalk.blue('\nBreakdown by competitor accounts:'));
    console.log(chalk.gray('─'.repeat(60)));
    console.log(chalk.gray(`${chalk.bold('Account'.padEnd(20))} | ${chalk.bold('Type'.padEnd(15))} | ${chalk.bold('Count'.padEnd(8))} | ${chalk.bold('Percentage')}`));
    console.log(chalk.gray('─'.repeat(60)));
    
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
          count: item.count as number
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
          count: item.count as number
        });
      }
    }
    
    // Sort by count descending
    competitorStats.sort((a, b) => b.count - a.count);
    
    // Calculate total competitor-related tweets
    const totalCompetitorTweets = competitorStats.reduce((sum, stat) => sum + stat.count, 0);
    
    // Display results
    if (competitorStats.length > 0) {
      for (const stat of competitorStats) {
        const percentage = ((stat.count / totalCompetitorTweets) * 100).toFixed(2);
        
        console.log(
          `${chalk.cyan(stat.account.padEnd(20))} | ${chalk.yellow(stat.type.padEnd(15))} | ${chalk.green(stat.count.toString().padEnd(8))} | ${chalk.magenta(percentage + '%')}`
        );
      }
    } else {
      console.log(chalk.yellow('No competitor-specific data found.'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error connecting to MongoDB:'), error);
  } finally {
    if (client) {
      await client.close();
      console.log(chalk.blue('\nMongoDB connection closed.'));
    }
  }
}

main().catch(console.error);