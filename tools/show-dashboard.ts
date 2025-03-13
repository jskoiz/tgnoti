#!/usr/bin/env node
/**
 * Terminal Dashboard for tgnoti
 * Displays real-time metrics for the Twitter-Telegram notification bridge
 */

import blessed from 'blessed';
import { grid as Grid } from 'blessed-contrib';
import { MongoClient, Collection } from 'mongodb';
import dotenv from 'dotenv';
import moment from 'moment';
import chalk from 'chalk';
import { MetricsSnapshot } from '../src/types/monitoring-enhanced.js';

// Load environment variables
dotenv.config();

// Dashboard configuration
const REFRESH_INTERVAL = 3000; // Refresh every 3 seconds
const MAX_HISTORY_POINTS = 30; // Number of data points to show in charts

// MongoDB connection
let client: MongoClient;
let metricsCollection: Collection;
let tweetsCollection: Collection;

// Dashboard state
let startTime: Date;
let lastRefreshTime: Date;
let isConnected = false;
let lastCycleTime: Date | null = null;
let totalCycles = 0;
let rateLimitsHit = 0;
let tweetsProcessed: Record<string, number> = {};
let topicNames: Record<string, string> = {
  '12111': 'COMPETITOR_TWEETS',
  '12110': 'COMPETITOR_MENTIONS',
  '381': 'TROJAN',
  '6531': 'KOL_MONITORING',
  '5572': 'TOPIC_5572',
  '5573': 'TOPIC_5573',
  '5574': 'TOPIC_5574',
  '6314': 'TOPIC_6314',
  '6317': 'TOPIC_6317',
  '6320': 'TOPIC_6320',
  '6355': 'TOPIC_6355'
};

// Dashboard components
let screen: blessed.Widgets.Screen;
let grid: any;
let headerBox: any;
let uptimeBox: any;
let cycleBox: any;
let tweetCountBox: any;
let topicBreakdownBox: any;
let rateLimitBox: any;
let logBox: any;
let tweetChart: any;
let rateLimitChart: any;

// Chart data
let tweetChartData: number[] = [];
let tweetChartLabels: string[] = [];
let rateLimitChartData: number[] = [];
let rateLimitChartLabels: string[] = [];

/**
 * Initialize the dashboard
 */
async function initDashboard() {
  console.log(chalk.blue('Initializing dashboard...'));
  
  // Set start time
  startTime = new Date();
  lastRefreshTime = new Date();
  
  try {
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Create the blessed screen
    createDashboardUI();
    
    // Start the refresh loop
    startRefreshLoop();
    
    console.log(chalk.green('Dashboard initialized successfully!'));
  } catch (error) {
    console.error(chalk.red('Error initializing dashboard:'), error);
    process.exit(1);
  }
}

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
  try {
    const mongoUri = process.env.MONGO_DB_STRING;
    
    if (!mongoUri) {
      console.error(chalk.red('Error: MongoDB connection string not found in environment variables.'));
      console.error(chalk.yellow('Please make sure MONGO_DB_STRING is set in your .env file.'));
      process.exit(1);
    }
    
    console.log(chalk.blue('Connecting to MongoDB...'));
    
    client = new MongoClient(mongoUri);
    await client.connect();
    
    // Use database name from connection string or default to 'twitter_notifications'
    const dbName = process.env.DB_NAME || 'twitter_notifications';
    const db = client.db(dbName);
    
    // Get collections
    metricsCollection = db.collection('metrics');
    tweetsCollection = db.collection('tweets');
    
    isConnected = true;
    console.log(chalk.green('Connected to MongoDB successfully!'));
  } catch (error) {
    console.error(chalk.red('Error connecting to MongoDB:'), error);
    isConnected = false;
    throw error;
  }
}

/**
 * Create the dashboard UI
 */
function createDashboardUI() {
  // Create a screen object
  screen = blessed.screen({
    smartCSR: true,
    title: 'tgnoti Dashboard',
    dockBorders: true,
    fullUnicode: true
  });
  
  // Create a grid
  grid = new Grid({
    rows: 12,
    cols: 12,
    screen: screen
  });
  
  // Header box
  headerBox = grid.set(0, 0, 1, 12, blessed.box, {
    content: ' tgnoti Dashboard ',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
      border: {
        fg: 'blue'
      }
    }
  });
  
  // Uptime box
  uptimeBox = grid.set(1, 0, 2, 3, blessed.box, {
    label: ' Uptime ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });
  
  // Cycle information box
  cycleBox = grid.set(1, 3, 2, 3, blessed.box, {
    label: ' Cycles ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });
  
  // Tweet count box
  tweetCountBox = grid.set(1, 6, 2, 3, blessed.box, {
    label: ' Tweets Processed ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });
  
  // Rate limit box
  rateLimitBox = grid.set(1, 9, 2, 3, blessed.box, {
    label: ' Rate Limits ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    }
  });
  
  // Topic breakdown box
  topicBreakdownBox = grid.set(3, 0, 4, 6, blessed.box, {
    label: ' Topic Breakdown ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    },
    content: 'Loading topic data...'
  });
  
  // Tweet chart
  tweetChart = grid.set(3, 6, 4, 6, blessed.line, {
    label: ' Tweets Over Time ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: true,
    legend: { width: 20 }
  });
  
  // Rate limit chart
  rateLimitChart = grid.set(7, 0, 5, 6, blessed.line, {
    label: ' Rate Limits Over Time ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    },
    xLabelPadding: 3,
    xPadding: 5,
    showLegend: true,
    wholeNumbersOnly: true,
    legend: { width: 20 }
  });
  
  // Log box
  logBox = grid.set(7, 6, 5, 6, blessed.log, {
    label: ' Recent Events ',
    tags: true,
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      border: {
        fg: 'cyan'
      }
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'blue'
      }
    }
  });
  
  // Quit on Escape, q, or Control-C
  screen.key(['escape', 'q', 'C-c'], function() {
    return process.exit(0);
  });
  
  // Render the screen
  screen.render();
}

/**
 * Start the refresh loop
 */
function startRefreshLoop() {
  // Initial refresh
  refreshDashboard();
  
  // Set up interval for refreshing
  setInterval(() => {
    refreshDashboard();
  }, REFRESH_INTERVAL);
}

/**
 * Refresh the dashboard with latest data
 */
async function refreshDashboard() {
  try {
    lastRefreshTime = new Date();
    
    if (!isConnected) {
      await connectToMongoDB();
    }
    
    // Fetch latest metrics
    await fetchMetrics();
    
    // Update UI components
    updateUptimeBox();
    updateCycleBox();
    updateTweetCountBox();
    updateRateLimitBox();
    updateTopicBreakdownBox();
    updateTweetChart();
    updateRateLimitChart();
    
    // Add a log entry for refresh
    logBox.log(`[${moment().format('HH:mm:ss')}] Dashboard refreshed`);
    
    // Render the screen
    screen.render();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logBox.log(`{red-fg}[${moment().format('HH:mm:ss')}] Error refreshing dashboard: ${errorMessage}{/red-fg}`);
    screen.render();
  }
}

/**
 * Fetch metrics from MongoDB
 */
async function fetchMetrics() {
  try {
    // Get the latest metrics snapshot
    const latestMetrics = await metricsCollection.find()
      .sort({ timestamp: -1 })
      .limit(1)
      .toArray();
    
    if (latestMetrics.length > 0) {
      const metrics = latestMetrics[0] as unknown as MetricsSnapshot;
      
      // Update cycle information
      if (metrics.timestamp) {
        lastCycleTime = new Date(metrics.timestamp);
      }
      
      // Update total cycles if available
      if (metrics.metrics && metrics.metrics.totalCycles) {
        totalCycles = metrics.metrics.totalCycles;
      }
      
      // Update rate limits hit if available
      if (metrics.metrics && metrics.metrics.rateLimitsHit) {
        rateLimitsHit = metrics.metrics.rateLimitsHit;
      }
    }
    
    // Get tweet counts by topic
    const topicCounts = await tweetsCollection.aggregate([
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
    
    // Update tweet counts by topic
    tweetsProcessed = {};
    for (const topic of topicCounts) {
      const topicId = topic._id as string;
      const count = topic.count as number;
      tweetsProcessed[topicId] = count;
    }
    
    // Get historical metrics for charts
    const historicalMetrics = await metricsCollection.find()
      .sort({ timestamp: -1 })
      .limit(MAX_HISTORY_POINTS)
      .toArray();
    
    // Process historical metrics for charts
    if (historicalMetrics.length > 0) {
      // Process in reverse order (oldest first)
      const sortedMetrics = historicalMetrics.reverse();
      
      // Reset chart data
      tweetChartData = [];
      tweetChartLabels = [];
      rateLimitChartData = [];
      rateLimitChartLabels = [];
      
      // Fill chart data
      for (const metric of sortedMetrics) {
        const timestamp = new Date(metric.timestamp);
        const timeLabel = moment(timestamp).format('HH:mm');
        
        // Tweet chart data
        let tweetCount = 0;
        if (metric.metrics && metric.metrics.tweetsProcessed) {
          tweetCount = metric.metrics.tweetsProcessed;
        }
        tweetChartData.push(tweetCount);
        tweetChartLabels.push(timeLabel);
        
        // Rate limit chart data
        let rateLimitCount = 0;
        if (metric.metrics && metric.metrics.rateLimitsHit) {
          rateLimitCount = metric.metrics.rateLimitsHit;
        }
        rateLimitChartData.push(rateLimitCount);
        rateLimitChartLabels.push(timeLabel);
      }
    }
  } catch (error) {
    console.error('Error fetching metrics:', error);
    throw error;
  }
}

/**
 * Update the uptime box
 */
function updateUptimeBox() {
  const now = new Date();
  const uptimeMs = now.getTime() - startTime.getTime();
  const uptime = moment.duration(uptimeMs);
  
  const hours = Math.floor(uptime.asHours());
  const minutes = uptime.minutes();
  const seconds = uptime.seconds();
  
  const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
  
  uptimeBox.setContent(`{center}Dashboard Uptime\n\n{bold}${uptimeStr}{/bold}{/center}`);
}

/**
 * Update the cycle box
 */
function updateCycleBox() {
  let lastCycleStr = 'Never';
  if (lastCycleTime) {
    lastCycleStr = moment(lastCycleTime).format('HH:mm:ss');
  }
  
  cycleBox.setContent(`{center}Last Cycle\n{bold}${lastCycleStr}{/bold}\n\nTotal Cycles\n{bold}${totalCycles}{/bold}{/center}`);
}

/**
 * Update the tweet count box
 */
function updateTweetCountBox() {
  const totalTweets = Object.values(tweetsProcessed).reduce((sum, count) => sum + count, 0);
  tweetCountBox.setContent(`{center}Total Tweets\n\n{bold}${totalTweets}{/bold}{/center}`);
}

/**
 * Update the rate limit box
 */
function updateRateLimitBox() {
  rateLimitBox.setContent(`{center}Rate Limits Hit\n\n{bold}${rateLimitsHit}{/bold}{/center}`);
}

/**
 * Update the topic breakdown box
 */
function updateTopicBreakdownBox() {
  let content = '';
  
  // Sort topics by count (descending)
  const sortedTopics = Object.entries(tweetsProcessed)
    .sort(([, countA], [, countB]) => countB - countA);
  
  for (const [topicId, count] of sortedTopics) {
    const topicName = topicNames[topicId] || `Topic ${topicId}`;
    content += `${topicName}: {bold}${count}{/bold}\n`;
  }
  
  topicBreakdownBox.setContent(content);
}

/**
 * Update the tweet chart
 */
function updateTweetChart() {
  if (tweetChartData.length > 0) {
    tweetChart.setData({
      x: tweetChartLabels,
      y: tweetChartData,
      title: 'Tweets',
      style: {
        line: 'yellow'
      }
    });
  }
}

/**
 * Update the rate limit chart
 */
function updateRateLimitChart() {
  if (rateLimitChartData.length > 0) {
    rateLimitChart.setData({
      x: rateLimitChartLabels,
      y: rateLimitChartData,
      title: 'Rate Limits',
      style: {
        line: 'red'
      }
    });
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(chalk.blue('Starting tgnoti Dashboard...'));
    await initDashboard();
  } catch (error) {
    console.error(chalk.red('Error starting dashboard:'), error);
    process.exit(1);
  }
}

// Start the dashboard
main().catch(console.error);
