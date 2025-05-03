#!/usr/bin/env node
// Script to fetch and display details about a Twitter user

import dotenv from 'dotenv';
import chalk from 'chalk';
import { Rettiwt } from 'rettiwt-api';

dotenv.config();

const apiKey = process.env.RETTIWT_API_KEY;
if (!apiKey) {
  console.error(chalk.red('Error: RETTIWT_API_KEY not found in .env file.'));
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error(chalk.red('Usage: npx tsx tools/check-user-details.ts <username>'));
  process.exit(1);
}

const username = args[0].replace('@', '').trim();

const rettiwt = new Rettiwt({ apiKey });

async function main() {
  try {
    console.log(chalk.blue(`Fetching user details for @${username}...`));

    const userDetails = await rettiwt.user.details(username);
    if (!userDetails) {
      console.error(chalk.red(`Error: User @${username} not found.`));
      process.exit(1);
    }

    console.log(chalk.green('User details:'));
    console.log(chalk.cyan(`ID: ${userDetails.id}`));
    console.log(chalk.cyan(`Username: ${userDetails.userName}`));
    console.log(chalk.cyan(`Display Name: ${userDetails.fullName}`));
    console.log(chalk.cyan(`Description: ${userDetails.description || 'N/A'}`));
    console.log(chalk.cyan(`Followers: ${userDetails.followersCount}`));
    console.log(chalk.cyan(`Following: ${userDetails.followingsCount}`));
    console.log(chalk.cyan(`Tweets: ${userDetails.statusesCount}`));
    console.log(chalk.cyan(`Verified: ${userDetails.isVerified ? 'Yes' : 'No'}`));
    console.log(chalk.cyan(`Created At: ${userDetails.createdAt}`));
    
    // Print all available properties
    console.log(chalk.yellow('\nAll properties:'));
    for (const [key, value] of Object.entries(userDetails)) {
      if (typeof value !== 'object') {
        console.log(`${key}: ${value}`);
      }
    }
  } catch (err) {
    console.error(chalk.red('Error fetching user details:'), err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();