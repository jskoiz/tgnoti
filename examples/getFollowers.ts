import { Rettiwt, User } from 'rettiwt-api';
import { ConsoleLogger } from '../src/utils/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get all API keys
const API_KEYS = [
  process.env.RETTIWT_API_KEY,
  process.env.RETTIWT_API_KEY_1,
  process.env.RETTIWT_API_KEY_2,
  process.env.RETTIWT_API_KEY_3,
].filter(Boolean) as string[];

interface KeyStatus {
  rateLimited: boolean;
  lastRateLimitTime: number;
  consecutiveFailures: number;
}

class ApiKeyManager {
  private currentKeyIndex = 0;
  private keyStatuses: Map<number, KeyStatus> = new Map();
  private probeClient: Rettiwt;

  constructor(private keys: string[]) {
    // Initialize status for each key
    keys.forEach((_, index) => {
      this.keyStatuses.set(index, {
        rateLimited: false,
        lastRateLimitTime: 0,
        consecutiveFailures: 0
      });
    });
    this.probeClient = new Rettiwt({ apiKey: this.getCurrentKey() });
  }

  getCurrentKey(): string {
    return this.keys[this.currentKeyIndex];
  }

  private async testKey(index: number): Promise<boolean> {
    try {
      // Use a simple API call to test the key
      this.probeClient = new Rettiwt({ apiKey: this.keys[index] });
      await this.probeClient.user.details('xSpiderSensei');
      
      // Reset status on success
      const status = this.keyStatuses.get(index)!;
      status.rateLimited = false;
      status.consecutiveFailures = 0;
      this.keyStatuses.set(index, status);
      
      return true;
    } catch (error: any) {
      if (error?.message === 'TOO_MANY_REQUESTS') {
        const status = this.keyStatuses.get(index)!;
        status.rateLimited = true;
        status.lastRateLimitTime = Date.now();
        status.consecutiveFailures++;
        this.keyStatuses.set(index, status);
      }
      return false;
    }
  }

  async rotateKey(): Promise<string> {
    const startIndex = this.currentKeyIndex;
    let attempts = 0;
    
    while (attempts < this.keys.length) {
      // Try next key
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      
      // Check if enough time has passed since last rate limit
      const status = this.keyStatuses.get(this.currentKeyIndex)!;
      const timeSinceLimit = Date.now() - status.lastRateLimitTime;
      const backoffTime = Math.min(60000 * Math.pow(2, status.consecutiveFailures - 1), 300000);
      
      if (!status.rateLimited || timeSinceLimit > backoffTime) {
        // Test the key before using it
        if (await this.testKey(this.currentKeyIndex)) {
          return this.getCurrentKey();
        }
      }
      
      attempts++;
    }
    
    // If we've tried all keys, return to original key
    this.currentKeyIndex = startIndex;
    return this.getCurrentKey();
  }

  async areAllKeysRateLimited(): Promise<boolean> {
    // Test each key that hasn't been used recently
    for (let i = 0; i < this.keys.length; i++) {
      const status = this.keyStatuses.get(i)!;
      const timeSinceLimit = Date.now() - status.lastRateLimitTime;
      const backoffTime = Math.min(60000 * Math.pow(2, status.consecutiveFailures - 1), 300000);
      
      if (!status.rateLimited || timeSinceLimit > backoffTime) {
        if (await this.testKey(i)) {
          return false;
        }
      }
    }
    return true;
  }

  getBackoffTime(): number {
    // Get the minimum backoff time among all keys
    let minBackoff = 300000; // 5 minutes max
    for (let i = 0; i < this.keys.length; i++) {
      const status = this.keyStatuses.get(i)!;
      const timeSinceLimit = Date.now() - status.lastRateLimitTime;
      const backoffTime = Math.min(60000 * Math.pow(2, status.consecutiveFailures - 1), 300000);
      const remainingTime = Math.max(0, backoffTime - timeSinceLimit);
      minBackoff = Math.min(minBackoff, remainingTime);
    }
    return Math.max(60000, minBackoff); // At least 1 minute
  }

  resetRateLimits(): void {
    this.keys.forEach((_, index) => {
      const status = this.keyStatuses.get(index)!;
      status.rateLimited = false;
      status.consecutiveFailures = 0;
      this.keyStatuses.set(index, status);
    });
  }
}

async function sleep(seconds: number) {
  const jitter = Math.random() * 2000; // Add up to 2 seconds of random jitter
  return new Promise(resolve => setTimeout(resolve, seconds * 1000 + jitter));
}

async function loadExistingProgress(filename: string): Promise<User[]> {
  try {
    const content = await fs.readFile(filename, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function getAllFollowers(username: string) {
  // Initialize dependencies
  const logger = new ConsoleLogger();
  const metrics = new MetricsManager(logger);
  const errorHandler = new ErrorHandler(logger, metrics);
  const keyManager = new ApiKeyManager(API_KEYS);
  
  // Create the initial Rettiwt client
  let client = new Rettiwt({ 
    apiKey: keyManager.getCurrentKey()
  });

  try {
    // First get the user details to get their ID
    console.log(`\nFetching user details for @${username}...`);
    const user = await client.user.details(username);
    
    if (!user) {
      throw new Error(`User @${username} not found`);
    }

    console.log(`Found user: @${user.userName} (${user.fullName})`);
    console.log(`Total followers: ${user.followersCount.toLocaleString()}\n`);

    // Check for existing progress
    const today = new Date().toISOString().split('T')[0];
    const tempFilename = `${username}_followers_temp_${today}.json`;
    
    let allFollowers: User[] = await loadExistingProgress(tempFilename);
    if (allFollowers.length > 0) {
      console.log(`Resuming from saved progress with ${allFollowers.length.toLocaleString()} followers\n`);
    }

    // Initialize variables for pagination
    let cursor: string | undefined;
    const batchSize = 100; // Maximum batch size
    let processedCount = allFollowers.length;
    const startTime = Date.now();
    let lastSaveCount = processedCount;
    const saveInterval = 500; // Save every 500 followers
    let consecutiveEmptyBatches = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    // Keep fetching while we haven't collected all followers
    while (processedCount < user.followersCount) {
      try {
        // Debug log current cursor
        console.log(`\nFetching batch with cursor: ${cursor || 'initial'}`);
        
        // Fetch the next batch of followers
        const result = await client.user.followers(user.id, batchSize, cursor);
        const newFollowers = result.list;
        
        // Handle empty batch
        if (newFollowers.length === 0) {
          consecutiveEmptyBatches++;
          console.log(`Received empty batch (${consecutiveEmptyBatches} consecutive)`);
          
          // Try rotating API key on empty batch
          if (consecutiveEmptyBatches >= 2) {
            const newKey = await keyManager.rotateKey();
            client = new Rettiwt({ apiKey: newKey });
            console.log('Multiple empty batches, switching API key and retrying...');
            await sleep(1.5);
            continue;
          }
          
          await sleep(1.5);
          continue;
        }
        
        // Reset counters on success
        consecutiveEmptyBatches = 0;
        consecutiveErrors = 0;
        
        // Add to our collection
        allFollowers.push(...newFollowers);
        processedCount += newFollowers.length;

        // Calculate progress
        const progress = (processedCount / user.followersCount) * 100;
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        const rate = processedCount / elapsedMinutes || 0;
        const estimatedTimeLeft = ((user.followersCount - processedCount) / rate) || 0;

        // Log detailed progress
        console.log(`Processed batch of ${newFollowers.length} followers`);
        console.log(`Progress: ${processedCount.toLocaleString()}/${user.followersCount.toLocaleString()} (${progress.toFixed(2)}%)`);
        console.log(`Rate: ${rate.toFixed(0)} followers/minute`);
        console.log(`Elapsed time: ${elapsedMinutes.toFixed(1)} minutes`);
        console.log(`Estimated time remaining: ${estimatedTimeLeft.toFixed(1)} minutes`);
        
        // Extract cursor value from next cursor object
        const nextCursor = result.next as any;
        cursor = nextCursor?.value;
        
        // Debug log next cursor
        console.log(`Next cursor value: ${cursor || 'none'}`);

        // Check if we lost the cursor but haven't finished
        if (!cursor && processedCount < user.followersCount) {
          console.log('\nLost cursor but haven\'t collected all followers.');
          console.log('Switching API key and retrying from last known position...');
          const newKey = await keyManager.rotateKey();
          client = new Rettiwt({ apiKey: newKey });
          await sleep(1.5);
          continue;
        }

        // Save progress periodically
        if (processedCount - lastSaveCount >= saveInterval) {
          await fs.writeFile(tempFilename, JSON.stringify(allFollowers, null, 2));
          console.log(`\nSaved progress to ${tempFilename} (${processedCount.toLocaleString()} followers)`);
          lastSaveCount = processedCount;
        }

        // Add delay between requests
        await sleep(1.5);
      } catch (error: any) {
        const isRateLimit = error?.message === 'TOO_MANY_REQUESTS';
        
        if (isRateLimit) {
          // Try rotating to a new API key
          const newKey = await keyManager.rotateKey();
          
          if (await keyManager.areAllKeysRateLimited()) {
            const waitTime = keyManager.getBackoffTime() / 1000;
            console.log('\nAll API keys are rate limited!');
            console.log(`Waiting ${waitTime.toFixed(0)} seconds before retrying...`);
            console.log('(Using exponential backoff based on consecutive failures)');
            await sleep(waitTime);
            keyManager.resetRateLimits();
          } else {
            console.log('\nRate limit reached, switching to next API key...');
            // Create new client with rotated key
            client = new Rettiwt({ apiKey: newKey });
          }
          
          // Save progress before continuing
          await fs.writeFile(tempFilename, JSON.stringify(allFollowers, null, 2));
          continue;
        }

        // Handle other errors
        console.error('\nError fetching batch:', error?.message || error);
        if (error?.details) {
          console.error('Error details:', JSON.stringify(error.details, null, 2));
        }
        
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.log(`\nToo many consecutive errors (${consecutiveErrors}), saving progress and stopping...`);
          break;
        }

        // Try switching API keys on error
        const newKey = await keyManager.rotateKey();
        client = new Rettiwt({ apiKey: newKey });
        console.log('Switching API key and retrying...');
        
        // Brief pause before retrying
        await sleep(1.5);
      }
    }

    // Save final results
    const filename = `${username}_followers_${today}.json`;
    await fs.writeFile(filename, JSON.stringify(allFollowers, null, 2));
    
    // Clean up temp file if it exists
    try {
      await fs.unlink(tempFilename);
    } catch {}

    // Log final stats
    const totalTime = (Date.now() - startTime) / 60000;
    console.log('\nCollection complete!');
    console.log(`Total followers saved: ${allFollowers.length.toLocaleString()}`);
    console.log(`Total time: ${totalTime.toFixed(1)} minutes`);
    console.log(`Average rate: ${(allFollowers.length / totalTime).toFixed(0)} followers/minute`);
    console.log(`Results saved to: ${filename}`);

  } catch (error) {
    console.error('Failed to fetch followers:', error);
  }
}

// Run the follower collection
getAllFollowers('xSpiderSensei');