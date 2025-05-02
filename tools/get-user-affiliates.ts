#!/usr/bin/env node
// Script to fetch and display the affiliates of a specified Twitter user

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
  console.error(chalk.red('Usage: npx tsx tools/get-user-affiliates.ts <username> [count] [cursor]'));
  process.exit(1);
}

const username = args[0].replace('@', '').trim();
const count = args[1] ? parseInt(args[1], 10) : 20;
const cursorArg = args[2]?.trim();

const rettiwt = new Rettiwt({ apiKey });

async function main() {
  try {
    console.log(chalk.blue(`Fetching affiliates for @${username} (count=${count})...`));

    const userDetails = await rettiwt.user.details(username);
    if (!userDetails || !(userDetails as any).id) {
      console.error(chalk.red(`Error: Unable to fetch user details for @${username}.`));
      process.exit(1);
    }
    const userId = (userDetails as any).id;

    const data = await rettiwt.user.affiliates(userId, count, cursorArg);

    const affiliates = (data as any).list as Array<{
      userName: string;
      fullName: string;
      followersCount: number;
      followingsCount: number;
      isVerified: boolean;
    }>;

    console.log(chalk.green(`Found ${affiliates.length} affiliates for @${username}:`));
    affiliates.forEach((user, index) => {
      console.log(chalk.cyan(`${index + 1}. @${user.userName} (${user.fullName})`));
      console.log(
        `   Followers: ${user.followersCount}, Following: ${user.followingsCount}, Verified: ${user.isVerified ? 'Yes' : 'No'}`
      );
    });

    const nextCursor =
      (data as any).cursor ||
      (data as any).nextToken ||
      (data as any).meta?.next_token;
    if (nextCursor) {
      console.log(chalk.yellow(`\nNext cursor available: ${nextCursor}`));
    }
  } catch (err) {
    console.error(chalk.red('Error fetching affiliates:'), err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();