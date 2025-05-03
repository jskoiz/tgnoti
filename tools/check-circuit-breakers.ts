#!/usr/bin/env node
// Script to check the status of all circuit breakers in the system

import dotenv from 'dotenv';
import chalk from 'chalk';
import { MongoClient } from 'mongodb';

dotenv.config();

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'tgnoti';
  
  if (!mongoUri) {
    console.error(chalk.red('Error: MONGODB_URI not found in .env file.'));
    process.exit(1);
  }
  
  let client: MongoClient | null = null;
  
  try {
    console.log(chalk.blue('Connecting to MongoDB...'));
    client = await MongoClient.connect(mongoUri);
    const db = client.db(dbName);
    
    console.log(chalk.blue('Checking circuit breakers status...'));
    
    // Get the monitor state collection
    const monitorStateCollection = db.collection('monitorState');
    
    // Get the current monitor state
    const monitorState = await monitorStateCollection.findOne({ type: 'monitorState' });
    
    if (monitorState && monitorState.circuitBreakerStates) {
      console.log(chalk.green(`Found ${Object.keys(monitorState.circuitBreakerStates).length} circuit breakers in monitor state`));
      
      // Check each circuit breaker state
      for (const [key, state] of Object.entries(monitorState.circuitBreakerStates)) {
        const failures = (state as any).failures || 0;
        const lastFailure = (state as any).lastFailure || 0;
        const lastTest = (state as any).lastTest || 0;
        
        const isOpen = failures > 0 && (Date.now() - lastFailure < 30000); // Assuming 30s reset timeout
        const status = isOpen ? chalk.red('OPEN') : chalk.green('CLOSED');
        
        console.log(chalk.cyan(`Circuit breaker: ${key}`));
        console.log(`  Status: ${status}`);
        console.log(`  Failures: ${failures}`);
        
        if (lastFailure > 0) {
          const lastFailureDate = new Date(lastFailure);
          console.log(`  Last failure: ${lastFailureDate.toISOString()} (${formatTimeAgo(lastFailure)})`);
        } else {
          console.log(`  Last failure: Never`);
        }
        
        if (lastTest > 0) {
          const lastTestDate = new Date(lastTest);
          console.log(`  Last test: ${lastTestDate.toISOString()} (${formatTimeAgo(lastTest)})`);
        } else {
          console.log(`  Last test: Never`);
        }
        
        console.log('');
      }
    } else {
      console.log(chalk.yellow('No monitor state found or no circuit breakers in state'));
    }
    
    // Also check for any active cooldown in the RettiwtErrorHandler
    console.log(chalk.blue('Checking for active cooldowns...'));
    
    // Get the last few error logs
    const logsCollection = db.collection('logs');
    const cooldownLogs = await logsCollection
      .find({ 
        message: { $regex: /cooldown/i },
        level: { $in: ['warn', 'error'] }
      })
      .sort({ timestamp: -1 })
      .limit(5)
      .toArray();
    
    if (cooldownLogs.length > 0) {
      console.log(chalk.yellow(`Found ${cooldownLogs.length} recent cooldown logs:`));
      
      for (const log of cooldownLogs) {
        console.log(`  ${new Date(log.timestamp).toISOString()} - ${log.level.toUpperCase()}: ${log.message}`);
      }
    } else {
      console.log(chalk.green('No recent cooldown logs found'));
    }
    
  } catch (error) {
    console.error(chalk.red('Error checking circuit breakers:'), error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log(chalk.blue('MongoDB connection closed'));
    }
  }
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }
  
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} minutes ago`;
  }
  
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hours ago`;
  }
  
  const days = Math.floor(hours / 24);
  return `${days} days ago`;
}

main();