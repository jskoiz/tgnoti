#!/usr/bin/env node

/**
 * Analyze Rejected Tweets Tool
 * 
 * This tool analyzes tweets that were found by the search parameters but not sent to Telegram.
 * It provides statistics on rejection reasons and topics with the most rejected tweets.
 * 
 * Usage:
 *   npm run analyze-rejected-tweets
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { TYPES } from '../src/types/di.js';
import { Logger } from '../src/types/logger.js';
import { StorageService } from '../src/services/StorageService.js';
import { MongoDBService } from '../src/services/MongoDBService.js';
import { ConfigService } from '../src/services/ConfigService.js';
import { TweetDocument } from '../src/types/mongodb.js';
import chalk from 'chalk';
import { createContainer } from '../src/config/container.js';

// Import container from global
declare global { 
  var container: Container | undefined; 
}

// Create container if it doesn't exist
if (!global.container) {
  global.container = createContainer();
}

// Get the number of days to analyze from command line arguments
const args = process.argv.slice(2);
const daysArg = args.find(arg => arg.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1], 10) : 7;

async function analyzeRejectedTweets(): Promise<void> {
  if (!global.container) {
    console.error('Container not initialized');
    process.exit(1);
  }
  
  // Get services from container
  const logger = global.container.get<Logger>(TYPES.Logger);
  const storage = global.container.get<StorageService>(TYPES.StorageService);
  const mongodb = global.container.get<MongoDBService>(TYPES.MongoDBService);
  const configService = global.container.get<ConfigService>(TYPES.ConfigService);
  
  logger.info(chalk.bold.blue(`===== Rejected Tweets Analysis (Last ${days} days) =====`));
  
  try {
    // Initialize storage
    await storage.initialize();
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    logger.info(chalk.cyan(`Analyzing tweets from ${startDate.toISOString()} to ${endDate.toISOString()}`));
    
    // Get rejection reasons summary
    const rejectionReasons = await mongodb.getRejectionReasonsSummary();
    
    // Get rejected tweets by topic
    const rejectedByTopic = await mongodb.getRejectedTweetsByTopic();
    
    // Get total rejected tweets
    const totalRejected = rejectionReasons.reduce((sum: number, reason: { count: number }) => sum + reason.count, 0);
    
    // Get total tweets (both sent and rejected)
    const totalTweets = await mongodb.getTweetsCollection().countDocuments({
      'metadata.capturedAt': { $gte: startDate, $lte: endDate }
    });
    
    // Calculate rejection rate
    const rejectionRate = totalRejected / (totalTweets || 1) * 100;
    
    // Print summary
    logger.info(chalk.bold.green('\n===== Summary ====='));
    logger.info(chalk.white(`Total tweets found: ${totalTweets}`));
    logger.info(chalk.white(`Total rejected tweets: ${totalRejected}`));
    logger.info(chalk.white(`Rejection rate: ${rejectionRate.toFixed(2)}%`));
    
    // Print rejection reasons
    logger.info(chalk.bold.green('\n===== Rejection Reasons ====='));
    if (rejectionReasons.length === 0) {
      logger.info(chalk.yellow('No rejected tweets found'));
    } else {
      // Calculate percentages
      const reasonsWithPercentage = rejectionReasons.map((reason: { reason: string; count: number }) => ({
        ...reason,
        percentage: (reason.count / totalRejected) * 100
      }));
      
      // Print table header
      logger.info(chalk.white('Reason                     | Count    | Percentage'));
      logger.info(chalk.white('---------------------------|----------|------------'));
      
      // Print each reason
      reasonsWithPercentage.forEach((reason: { reason: string; count: number; percentage: number }) => {
        const reasonText = reason.reason.padEnd(25);
        const countText = String(reason.count).padEnd(8);
        const percentageText = `${reason.percentage.toFixed(2)}%`;
        logger.info(chalk.white(`${reasonText} | ${countText} | ${percentageText}`));
      });
    }
    
    // Print rejected tweets by topic
    logger.info(chalk.bold.green('\n===== Rejected Tweets by Topic ====='));
    if (rejectedByTopic.length === 0) {
      logger.info(chalk.yellow('No rejected tweets found'));
    } else {
      // Get topic names
      const topics = configService.getTopics();
      const topicMap = new Map<string, string>();
      topics.forEach(topic => {
        topicMap.set(topic.id.toString(), topic.name);
      });
      
      // Calculate percentages
      const topicsWithPercentage = rejectedByTopic.map((topic: { topicId: string; count: number }) => ({
        ...topic,
        name: topicMap.get(topic.topicId) || `Unknown (${topic.topicId})`,
        percentage: (topic.count / totalRejected) * 100
      }));
      
      // Print table header
      logger.info(chalk.white('Topic                      | Count    | Percentage'));
      logger.info(chalk.white('---------------------------|----------|------------'));
      
      // Print each topic
      topicsWithPercentage.forEach((topic: { name: string; count: number; percentage: number }) => {
        const topicText = topic.name.padEnd(25);
        const countText = String(topic.count).padEnd(8);
        const percentageText = `${topic.percentage.toFixed(2)}%`;
        logger.info(chalk.white(`${topicText} | ${countText} | ${percentageText}`));
      });
      
      // Print sample of rejected tweets
      logger.info(chalk.bold.green('\n===== Sample Rejected Tweets ====='));
      const sampleTweets = await mongodb.getRejectedTweets({
        startDate,
        endDate,
        limit: 5
      });
      
      if (sampleTweets.length === 0) {
        logger.info(chalk.yellow('No rejected tweets found'));
      } else {
        // Get topic names (reusing the topicMap from above)
        sampleTweets.forEach((tweet: TweetDocument, index: number) => {
          const topicName = topicMap.get(tweet.metadata.topicId) || `Unknown (${tweet.metadata.topicId})`;
          logger.info(chalk.white(`\n[${index + 1}] Tweet ID: ${tweet.id}`));
          logger.info(chalk.white(`From: @${tweet.tweetBy.userName}`));
          logger.info(chalk.white(`Topic: ${topicName}`));
          logger.info(chalk.white(`Rejection Reason: ${tweet.metadata.rejectionReason || 'Unknown'}`));
          logger.info(chalk.white(`Text: ${tweet.text.substring(0, 100)}${tweet.text.length > 100 ? '...' : ''}`));
        });
      }
    }
    
    // Close connections
    await storage.close();
    
    logger.info(chalk.bold.blue('\n===== Analysis Complete ====='));
  } catch (error) {
    logger.error('Error analyzing rejected tweets:', error instanceof Error ? error : new Error(String(error)));
  }
}

// Run the analysis
analyzeRejectedTweets().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
