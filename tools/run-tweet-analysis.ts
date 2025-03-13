#!/usr/bin/env node
// This script runs the tweet category breakdown analysis

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Script to run the tweet category breakdown analysis
 * TypeScript version of the original shell script
 */

// Check if .env file exists and contains MongoDB connection string
function checkEnvironment(): void {
  console.log(chalk.blue('Checking environment...'));
  
  if (!fs.existsSync('.env')) {
    console.error(chalk.red('Error: .env file not found. This script requires the existing .env file with MongoDB connection.'));
    process.exit(1);
  }
  
  try {
    const envContent = fs.readFileSync('.env', 'utf8');
    if (!envContent.includes('MONGO_DB_STRING')) {
      console.error(chalk.red('Error: MONGO_DB_STRING not found in .env file.'));
      console.error(chalk.yellow('Please ensure the .env file contains the MongoDB connection string.'));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Error reading .env file:'), error);
    process.exit(1);
  }
  
  console.log(chalk.green('Using existing MongoDB connection from .env file.'));
}

// Run the tweet category breakdown analysis
async function main(): Promise<void> {
  try {
    // Check environment
    checkEnvironment();
    
    // Run the analysis script
    console.log(chalk.blue('Running tweet category breakdown analysis...'));
    console.log(chalk.blue('Executing tweet-category-breakdown.ts with ts-node...'));
    try {
      // Use ts-node with --esm flag to run the TypeScript file
      execSync('npx tsx tools/tweet-category-breakdown.ts', { stdio: 'inherit' });
      console.log(chalk.green('Script executed successfully.'));
    } catch (error) {
      console.error(chalk.red('Error executing tweet-category-breakdown.ts:'), error);
      process.exit(1);
    }
    
    
    console.log('');
    console.log(chalk.green('Analysis complete!'));
  } catch (error) {
    console.error(chalk.red('Error running analysis:'), error);
    process.exit(1);
  }
}

main().catch(console.error);