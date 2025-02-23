import { Rettiwt, User } from 'rettiwt-api';
import { ConsoleLogger } from '../src/utils/logger.js';
import { MetricsManager } from '../src/utils/MetricsManager.js';
import { ErrorHandler } from '../src/utils/ErrorHandler.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Global error handlers.
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error(chalk.red('Uncaught Exception:'), err);
  process.exit(1);
});

// Collect available API keys.
const API_KEYS = [
  process.env.RETTIWT_API_KEY,
  process.env.RETTIWT_API_KEY_1,
  process.env.RETTIWT_API_KEY_2,
  process.env.RETTIWT_API_KEY_3,
].filter(Boolean) as string[];

// Use a single proxy URL for keys other than the first.
const PROXY_URL = process.env.PROXY_URL || '';

// Helper: Convert proxy string to a URL object if set.
function asURL(proxy: string): URL | undefined {
  return proxy ? new URL(proxy) : undefined;
}

interface KeyStatus {
  rateLimited: boolean;
  lastRateLimitTime: number;
  consecutiveFailures: number;
}

interface KeyProxyPair {
  apiKey: string;
  proxyUrl: string;
}

class ApiKeyManager {
  private currentKeyIndex = -1; // start at -1 so first rotation lands at index 0.
  private keyStatuses: Map<number, KeyStatus> = new Map();
  private probeClient: Rettiwt;

  constructor(private keys: string[], private logger: ConsoleLogger) {
    keys.forEach((_, index) => {
      this.keyStatuses.set(index, {
        rateLimited: false,
        lastRateLimitTime: 0,
        consecutiveFailures: 0,
      });
    });
    if (this.keys.length > 0) {
      this.currentKeyIndex = 0;
      this.probeClient = new Rettiwt({
        apiKey: this.keys[0],
        proxyUrl: asURL(this.getProxyForIndex(0))
      });
    }
  }

  // Returns no proxy for key index 0; otherwise, returns PROXY_URL.
  private getProxyForIndex(index: number): string {
    return index === 0 ? '' : PROXY_URL;
  }

  // Exponential backoff (max 5 minutes).
  private getBackoffTimeForStatus(status: KeyStatus): number {
    return Math.min(60000 * Math.pow(2, status.consecutiveFailures - 1), 300000);
  }

  // Test the key by doing a lightweight API call.
  private async testKey(index: number): Promise<boolean> {
    try {
      this.probeClient = new Rettiwt({
        apiKey: this.keys[index],
        proxyUrl: asURL(this.getProxyForIndex(index))
      });
      await this.probeClient.user.details('xSpiderSensei');
      const status = this.keyStatuses.get(index)!;
      status.rateLimited = false;
      status.consecutiveFailures = 0;
      this.keyStatuses.set(index, status);
      return true;
    } catch (error: any) {
      if (error?.code === 'TOO_MANY_REQUESTS' || error?.message === 'TOO_MANY_REQUESTS') {
        const status = this.keyStatuses.get(index)!;
        status.rateLimited = true;
        status.lastRateLimitTime = Date.now();
        status.consecutiveFailures++;
        this.keyStatuses.set(index, status);
      }
      return false;
    }
  }

  /**
   * Rotates through the keys and returns the next key/proxy pair.
   * If forceSwitch is true, key 0 (no proxy) is skipped.
   */
  async getNextKeyPair(forceSwitch: boolean = false): Promise<KeyProxyPair> {
    if (this.keys.length === 1) {
      return { apiKey: this.keys[0], proxyUrl: '' };
    }
    // Try each key once, starting from an appropriate index.
    const start = forceSwitch ? 1 : (this.currentKeyIndex + 1) % this.keys.length;
    for (let i = 0; i < this.keys.length; i++) {
      const candidateIndex = (start + i) % this.keys.length;
      if (forceSwitch && candidateIndex === 0) continue; // Skip key 0 when forcing switch.
      this.currentKeyIndex = candidateIndex;
      const testResult = await this.testKey(candidateIndex);
      this.logger.info(chalk.cyan(`Test for API key index ${candidateIndex} returned ${testResult}`));
      if (testResult) {
        this.logger.info(chalk.cyan(
          `Using API key index ${candidateIndex} ${candidateIndex === 0 ? '(no proxy)' : `(proxy: ${PROXY_URL})`}`
        ));
        return { apiKey: this.keys[candidateIndex], proxyUrl: this.getProxyForIndex(candidateIndex) };
      } else {
        this.logger.info(chalk.yellow(`API key index ${candidateIndex} failed test. Trying next key...`));
      }
    }
    // If forceSwitch is true and no non-zero key is available, try key 0.
    if (forceSwitch && await this.testKey(0)) {
      this.currentKeyIndex = 0;
      this.logger.info(chalk.cyan(`Falling back to API key index 0 (no proxy)`));
      return { apiKey: this.keys[0], proxyUrl: '' };
    }
    this.logger.info(chalk.yellow('All keys appear rate limited; returning current key.'));
    return { apiKey: this.keys[this.currentKeyIndex], proxyUrl: this.getProxyForIndex(this.currentKeyIndex) };
  }

  // Checks if all keys are rate limited.
  async areAllKeysRateLimited(): Promise<boolean> {
    for (let i = 0; i < this.keys.length; i++) {
      const status = this.keyStatuses.get(i)!;
      const timeSinceLimit = Date.now() - status.lastRateLimitTime;
      const backoffTime = this.getBackoffTimeForStatus(status);
      if (!status.rateLimited || timeSinceLimit > backoffTime) {
        if (await this.testKey(i)) return false;
      }
    }
    return true;
  }

  // Returns minimum wait time before any key is available.
  getBackoffTime(): number {
    let minBackoff = 300000;
    for (let i = 0; i < this.keys.length; i++) {
      const status = this.keyStatuses.get(i)!;
      const timeSinceLimit = Date.now() - status.lastRateLimitTime;
      const backoffTime = this.getBackoffTimeForStatus(status);
      const remainingTime = Math.max(0, backoffTime - timeSinceLimit);
      minBackoff = Math.min(minBackoff, remainingTime);
    }
    return Math.max(60000, minBackoff);
  }

  // Resets rate limit statuses for all keys.
  resetRateLimits(): void {
    this.keys.forEach((_, index) => {
      const status = this.keyStatuses.get(index)!;
      status.rateLimited = false;
      status.consecutiveFailures = 0;
      this.keyStatuses.set(index, status);
    });
  }
}

// Utility: Sleep with minimal jitter.
async function sleep(seconds: number): Promise<void> {
  const jitter = Math.random() * 0; // No jitter for predictable timing.
  return new Promise(resolve => setTimeout(resolve, seconds * 1000 + jitter));
}

// Loads previously saved follower progress.
async function loadExistingProgress(filename: string): Promise<User[]> {
  try {
    const content = await fs.readFile(filename, 'utf-8');
    return JSON.parse(content) as User[];
  } catch {
    return [];
  }
}

interface FollowersResult {
  list: User[];
  next?: { value: string };
}

async function getAllFollowers(username: string) {
  const logger = new ConsoleLogger();
  const metrics = new MetricsManager(logger);
  const errorHandler = new ErrorHandler(logger, metrics);
  const keyManager = new ApiKeyManager(API_KEYS, logger);

  // Get the initial key/proxy pair.
  const keyPair = await keyManager.getNextKeyPair();
  let client = new Rettiwt({ 
    apiKey: keyPair.apiKey, 
    proxyUrl: asURL(keyPair.proxyUrl)
  });

  try {
    logger.info(chalk.green(`\nFetching user details for @${username}...`));
    const user = await client.user.details(username);
    if (!user) throw new Error(`User @${username} not found`);

    logger.info(chalk.green(`Found user: @${user.userName} (${user.fullName})`));
    logger.info(chalk.green(`Total followers: ${user.followersCount.toLocaleString()}\n`));

    const today = new Date().toISOString().split('T')[0];
    const tempFilename = `${username}_followers_temp_${today}.json`;
    let allFollowers: User[] = await loadExistingProgress(tempFilename);
    if (allFollowers.length > 0) {
      logger.info(chalk.magenta(`Resuming from saved progress with ${allFollowers.length.toLocaleString()} followers\n`));
    }

    let cursor: string | undefined;
    const batchSize = 100;
    let processedCount = allFollowers.length;
    const startTime = Date.now();
    let lastSaveCount = processedCount;
    const saveInterval = 500;
    let consecutiveEmptyBatches = 0;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5;

    while (processedCount < user.followersCount) {
      try {
        // On rate limit, force switch (skip key 0).
        const pair = await keyManager.getNextKeyPair(true);
        client = new Rettiwt({ 
          apiKey: pair.apiKey, 
          proxyUrl: asURL(pair.proxyUrl)
        });

        logger.info(chalk.blue(`\nFetching batch with cursor: ${cursor || 'initial'}`));
        const result: FollowersResult = await client.user.followers(user.id, batchSize, cursor);
        const newFollowers = result.list;

        if (newFollowers.length === 0) {
          consecutiveEmptyBatches++;
          logger.info(chalk.yellow(`Received empty batch (${consecutiveEmptyBatches} consecutive)`));
          if (consecutiveEmptyBatches >= 2) {
            logger.info(chalk.yellow('Multiple empty batches detected. Waiting before retrying...'));
            await sleep(1.5);
            continue;
          }
          await sleep(1.5);
          continue;
        }

        consecutiveEmptyBatches = 0;
        consecutiveErrors = 0;
        allFollowers.push(...newFollowers);
        processedCount += newFollowers.length;

        const progress = (processedCount / user.followersCount) * 100;
        const elapsedMinutes = (Date.now() - startTime) / 60000;
        const rate = processedCount / elapsedMinutes || 0;
        const estimatedTimeLeft = ((user.followersCount - processedCount) / rate) || 0;
        logger.info(chalk.green(`Processed batch of ${newFollowers.length} followers`));
        logger.info(chalk.green(`Progress: ${processedCount.toLocaleString()}/${user.followersCount.toLocaleString()} (${progress.toFixed(2)}%)`));
        logger.info(chalk.green(`Rate: ${rate.toFixed(0)} followers/minute`));
        logger.info(chalk.green(`Elapsed time: ${elapsedMinutes.toFixed(1)} minutes`));
        logger.info(chalk.green(`Estimated time remaining: ${estimatedTimeLeft.toFixed(1)} minutes`));

        cursor = result.next?.value;
        logger.info(chalk.blue(`Next cursor value: ${cursor || 'none'}`));

        if (!cursor && processedCount < user.followersCount) {
          logger.info(chalk.yellow('\nLost cursor before finishing. Retrying with next API key...'));
          await sleep(1.5);
          continue;
        }

        if (processedCount - lastSaveCount >= saveInterval) {
          await fs.writeFile(tempFilename, JSON.stringify(allFollowers, null, 2));
          logger.info(chalk.magenta(`\nSaved progress to ${tempFilename} (${processedCount.toLocaleString()} followers)`));
          lastSaveCount = processedCount;
        }

        await sleep(0.25);
      } catch (error: any) {
        const isRateLimit = error?.code === 'TOO_MANY_REQUESTS' || error?.message === 'TOO_MANY_REQUESTS';
        if (isRateLimit) {
          logger.info(chalk.yellow('\nRate limit reached. Forcing API key rotation...'));
          if (await keyManager.areAllKeysRateLimited()) {
            const waitTime = keyManager.getBackoffTime() / 1000;
            logger.info(chalk.red(`\nAll API keys are rate limited! Waiting ${waitTime.toFixed(0)} seconds before retrying... (Exponential backoff)`));
            await sleep(waitTime);
            keyManager.resetRateLimits();
          }
          await fs.writeFile(tempFilename, JSON.stringify(allFollowers, null, 2));
          continue;
        }
        logger.error(chalk.red(`Error fetching batch: ${error instanceof Error ? error.message : error}`));
        if (error?.details) {
          logger.error(chalk.red(`Error details: ${JSON.stringify(error.details, null, 2)}`));
        }
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.info(chalk.yellow(`Too many consecutive errors (${consecutiveErrors}). Saving progress and stopping...`));
          break;
        }
        logger.info(chalk.yellow('Switching API key and retrying...'));
        await sleep(1.5);
      }
    }

    const filename = `${username}_followers_${today}.json`;
    await fs.writeFile(filename, JSON.stringify(allFollowers, null, 2));
    try {
      await fs.unlink(tempFilename);
    } catch {
      // Ignore temp file removal errors.
    }
    const totalTime = (Date.now() - startTime) / 60000;
    logger.info(chalk.green('\nCollection complete!'));
    logger.info(chalk.green(`Total followers saved: ${allFollowers.length.toLocaleString()}`));
    logger.info(chalk.green(`Total time: ${totalTime.toFixed(1)} minutes`));
    logger.info(chalk.green(`Average rate: ${(allFollowers.length / totalTime).toFixed(0)} followers/minute`));
    logger.info(chalk.green(`Results saved to: ${filename}`));
  } catch (error: any) {
    logger.error(chalk.red(`Failed to fetch followers: ${error instanceof Error ? error.message : error}`));
  }
}

getAllFollowers('xSpiderSensei').catch((err) => {
  console.error(chalk.red('Fatal error in main execution:'), err);
  process.exit(1);
});
