import { inject, injectable } from 'inversify';
import pkg from 'sqlite3';
const { Database: SQLiteDatabase } = pkg;
import { TYPES } from '../types/di.js';
import { Logger } from '../types/logger.js';
import { MetricsManager } from '../types/metrics.js';
import {
  AffiliateChange,
  AffiliateState,
  IAffiliateStorage,
} from '../types/affiliate.js';

@injectable()
export class AffiliateStorage implements IAffiliateStorage {
  private db: InstanceType<typeof SQLiteDatabase>;
  private logger: Logger;
  private metrics: MetricsManager;

  constructor(
    @inject(TYPES.Logger) logger: Logger,
    @inject(TYPES.MetricsManager) metrics: MetricsManager
  ) {
    this.logger = logger;
    this.metrics = metrics;
    this.db = new SQLiteDatabase('affiliate_data.db');
    this.initializeDatabase().catch((err: Error) => {
      this.logger.error('Failed to initialize affiliate database', err);
      throw err;
    });
  }

  private async initializeDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Create tables if they don't exist
        this.db.run(`
          CREATE TABLE IF NOT EXISTS monitored_orgs (
            username TEXT PRIMARY KEY,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS affiliate_states (
            org_username TEXT PRIMARY KEY,
            affiliates TEXT NOT NULL,
            last_checked DATETIME NOT NULL,
            last_changed DATETIME,
            FOREIGN KEY (org_username) REFERENCES monitored_orgs(username)
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS affiliate_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_username TEXT NOT NULL,
            added_affiliates TEXT,
            removed_affiliates TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (org_username) REFERENCES monitored_orgs(username)
          )
        `, (err: Error | null) => {
          if (err) {
            this.logger.error('Failed to create affiliate tables', err);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async getAffiliates(orgUsername: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT affiliates FROM affiliate_states WHERE org_username = ?',
        [orgUsername],
        (err: Error | null, row: { affiliates: string } | undefined) => {
          if (err) {
            this.logger.error('Failed to get affiliates', err);
            reject(err);
          } else {
            resolve(row ? JSON.parse(row.affiliates) : []);
          }
        }
      );
    });
  }

  async updateAffiliates(orgUsername: string, affiliates: string[]): Promise<void> {
    const now = new Date().toISOString();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO affiliate_states (org_username, affiliates, last_checked, last_changed)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(org_username) DO UPDATE SET
         affiliates = ?,
         last_checked = ?,
         last_changed = ?`,
        [
          orgUsername,
          JSON.stringify(affiliates),
          now,
          now,
          JSON.stringify(affiliates),
          now,
          now,
        ],
        (err: Error | null) => {
          if (err) {
            this.logger.error('Failed to update affiliates', err);
            reject(err);
          } else {
            this.metrics.increment('affiliate.storage.updates');
            resolve();
          }
        }
      );
    });
  }

  async getMonitoredOrgs(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT username FROM monitored_orgs',
        (err: Error | null, rows: { username: string }[]) => {
          if (err) {
            this.logger.error('Failed to get monitored orgs', err);
            reject(err);
          } else {
            resolve(rows.map((row) => row.username));
          }
        }
      );
    });
  }

  async addMonitoredOrg(orgUsername: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO monitored_orgs (username) VALUES (?)',
        [orgUsername],
        (err: Error | null) => {
          if (err) {
            this.logger.error('Failed to add monitored org', err);
            reject(err);
          } else {
            this.metrics.increment('affiliate.storage.orgs.added');
            resolve();
          }
        }
      );
    });
  }

  async removeMonitoredOrg(orgUsername: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM monitored_orgs WHERE username = ?',
        [orgUsername],
        (err: Error | null) => {
          if (err) {
            this.logger.error('Failed to remove monitored org', err);
            reject(err);
          } else {
            this.metrics.increment('affiliate.storage.orgs.removed');
            resolve();
          }
        }
      );
    });
  }

  async getAffiliateState(orgUsername: string): Promise<AffiliateState | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM affiliate_states WHERE org_username = ?',
        [orgUsername],
        (err: Error | null, row: any) => {
          if (err) {
            this.logger.error('Failed to get affiliate state', err);
            reject(err);
          } else if (!row) {
            resolve(null);
          } else {
            resolve({
              orgUsername: row.org_username,
              affiliates: JSON.parse(row.affiliates),
              lastChecked: new Date(row.last_checked),
              lastChanged: row.last_changed ? new Date(row.last_changed) : undefined,
            });
          }
        }
      );
    });
  }

  async saveAffiliateState(state: AffiliateState): Promise<void> {
    return this.updateAffiliates(state.orgUsername, state.affiliates);
  }

  async getAffiliateHistory(orgUsername: string): Promise<AffiliateChange[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM affiliate_changes WHERE org_username = ? ORDER BY timestamp DESC',
        [orgUsername],
        (err: Error | null, rows: any[]) => {
          if (err) {
            this.logger.error('Failed to get affiliate history', err);
            reject(err);
          } else {
            resolve(
              rows.map((row) => ({
                added: JSON.parse(row.added_affiliates || '[]'),
                removed: JSON.parse(row.removed_affiliates || '[]'),
                timestamp: new Date(row.timestamp),
              }))
            );
          }
        }
      );
    });
  }

  async addAffiliateChange(
    orgUsername: string,
    change: AffiliateChange
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO affiliate_changes 
         (org_username, added_affiliates, removed_affiliates, timestamp)
         VALUES (?, ?, ?, ?)`,
        [
          orgUsername,
          JSON.stringify(change.added),
          JSON.stringify(change.removed),
          change.timestamp.toISOString(),
        ],
        (err: Error | null) => {
          if (err) {
            this.logger.error('Failed to add affiliate change', err);
            reject(err);
          } else {
            this.metrics.increment('affiliate.storage.changes.recorded');
            resolve();
          }
        }
      );
    });
  }
}