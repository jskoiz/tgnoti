#!/usr/bin/env node
// Script to reset all circuit breakers in the system by clearing the monitor state

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
    
    console.log(chalk.blue('Resetting circuit breakers...'));
    
    // Get the monitor state collection
    const monitorStateCollection = db.collection('monitorState');
    
    // Get the current monitor state
    const monitorState = await monitorStateCollection.findOne({ type: 'monitorState' });
    
    if (monitorState && monitorState.circuitBreakerStates) {
      console.log(chalk.green(`Found ${Object.keys(monitorState.circuitBreakerStates).length} circuit breakers in monitor state`));
      
      // Reset each circuit breaker state
      for (const [key, state] of Object.entries(monitorState.circuitBreakerStates)) {
        console.log(chalk.cyan(`Resetting circuit breaker: ${key}`));
        
        // Create a new state with reset values
        monitorState.circuitBreakerStates[key] = {
          failures: 0,
          lastFailure: 0,
          lastTest: 0
        };
      }
      
      // Save the updated monitor state
      await monitorStateCollection.updateOne(
        { type: 'monitorState' },
        { $set: { 
            circuitBreakerStates: monitorState.circuitBreakerStates,
            updatedAt: new Date()
          }
        }
      );
      
      console.log(chalk.green('Circuit breaker states reset successfully'));
    } else {
      console.log(chalk.yellow('No monitor state found or no circuit breakers in state'));
      
      // Create a new empty state
      await monitorStateCollection.updateOne(
        { type: 'monitorState' },
        { 
          $set: { 
            circuitBreakerStates: {},
            lastPollTimes: {},
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
      
      console.log(chalk.green('Created new empty monitor state'));
    }
    
    console.log(chalk.green('All circuit breakers have been reset'));
  } catch (error) {
    console.error(chalk.red('Error resetting circuit breakers:'), error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log(chalk.blue('MongoDB connection closed'));
    }
  }
}

main();