import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import * as fs from 'fs';
import * as path from 'path';

export interface CsvAccount {
  id: string;
  username: string;
  rank: number;
}

@injectable()
export class CsvAccountLoader {
  constructor(
    @inject(TYPES.Logger) private logger: Logger
  ) {
    this.logger.setComponent('CsvAccountLoader');
  }

  /**
   * Load accounts from CSV file
   * @param csvPath Path to the CSV file
   * @returns Array of parsed accounts
   */
  async loadAccountsFromCsv(csvPath: string): Promise<CsvAccount[]> {
    try {
      this.logger.info(`Loading accounts from CSV: ${csvPath}`);
      
      // Check if file exists
      if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
      }

      // Read and parse CSV
      const csvContent = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        throw new Error('CSV file is empty');
      }

      // Skip header row and parse data
      const accounts: CsvAccount[] = [];
      const header = lines[0].toLowerCase();
      
      // Validate header format
      if (!header.includes('id') || !header.includes('user') || !header.includes('rank')) {
        throw new Error('CSV must have columns: ID, user, rank');
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = line.split(',');
        if (columns.length < 3) {
          this.logger.warn(`Skipping invalid line ${i + 1}: ${line}`);
          continue;
        }

        const id = columns[0].trim();
        const username = columns[1].trim().replace('@', ''); // Remove @ if present
        const rank = parseInt(columns[2].trim(), 10);

        if (!id || !username || isNaN(rank)) {
          this.logger.warn(`Skipping invalid data on line ${i + 1}: ID=${id}, user=${username}, rank=${rank}`);
          continue;
        }

        accounts.push({
          id,
          username,
          rank
        });
      }

      this.logger.info(`Successfully loaded ${accounts.length} accounts from CSV`);
      
      // Log some statistics
      const rankStats = this.calculateRankStatistics(accounts);
      this.logger.info('Account rank distribution:', rankStats);

      return accounts;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Error loading accounts from CSV: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Create optimal batches from accounts for processing
   * @param accounts Array of accounts to batch
   * @param batchSize Size of each batch (default: 8)
   * @returns Array of batches, each containing usernames
   */
  createOptimalBatches(accounts: CsvAccount[], batchSize: number = 8): string[][] {
    this.logger.info(`Creating batches of ${batchSize} accounts from ${accounts.length} total accounts`);
    
    // Extract just the usernames for processing
    const usernames = accounts.map(account => account.username);
    
    // Create batches
    const batches: string[][] = [];
    for (let i = 0; i < usernames.length; i += batchSize) {
      const batch = usernames.slice(i, i + batchSize);
      batches.push(batch);
    }

    this.logger.info(`Created ${batches.length} batches for processing`);
    
    // Log batch details
    batches.forEach((batch, index) => {
      this.logger.debug(`Batch ${index + 1}: ${batch.length} accounts - ${batch.join(', ')}`);
    });

    return batches;
  }

  /**
   * Calculate rank distribution statistics
   * @param accounts Array of accounts
   * @returns Statistics object
   */
  private calculateRankStatistics(accounts: CsvAccount[]): Record<string, number> {
    const stats: Record<string, number> = {};
    
    // Count by rank ranges
    let rank4_9 = 0;
    let rank10_19 = 0;
    let rank20_29 = 0;
    let rank30_plus = 0;

    accounts.forEach(account => {
      if (account.rank >= 4 && account.rank <= 9) {
        rank4_9++;
      } else if (account.rank >= 10 && account.rank <= 19) {
        rank10_19++;
      } else if (account.rank >= 20 && account.rank <= 29) {
        rank20_29++;
      } else if (account.rank >= 30) {
        rank30_plus++;
      }
    });

    return {
      'rank_4_9': rank4_9,
      'rank_10_19': rank10_19,
      'rank_20_29': rank20_29,
      'rank_30_plus': rank30_plus,
      'total': accounts.length,
      'min_rank': Math.min(...accounts.map(a => a.rank)),
      'max_rank': Math.max(...accounts.map(a => a.rank))
    };
  }

  /**
   * Get accounts by rank range
   * @param accounts Array of accounts
   * @param minRank Minimum rank (inclusive)
   * @param maxRank Maximum rank (inclusive)
   * @returns Filtered accounts
   */
  getAccountsByRankRange(accounts: CsvAccount[], minRank: number, maxRank: number): CsvAccount[] {
    return accounts.filter(account => account.rank >= minRank && account.rank <= maxRank);
  }

  /**
   * Shuffle accounts for randomized processing
   * @param accounts Array of accounts to shuffle
   * @returns Shuffled array
   */
  shuffleAccounts(accounts: CsvAccount[]): CsvAccount[] {
    const shuffled = [...accounts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}