import { injectable, inject } from 'inversify';
import sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import path from 'path';

@injectable()
export class DatabaseManager {
  private db: Database;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.BasePath) basePath: string
  ) {
    const dbPath = path.join(basePath, 'affiliate_data.db');
    this.db = new sqlite3.Database(dbPath);
  }

  async initialize(): Promise<void> {
    const schema = `
      CREATE TABLE IF NOT EXISTS topic_filters (
        id INTEGER PRIMARY KEY,
        topic_id INTEGER NOT NULL,
        filter_type TEXT NOT NULL CHECK(filter_type IN ('user', 'mention', 'keyword')),
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER,
        UNIQUE(topic_id, filter_type, value)
      );
    `;

    return new Promise((resolve, reject) => {
      this.db.exec(schema, (err) => {
        if (err) {
          this.logger.error('Failed to initialize database schema', err);
          reject(err);
          return;
        }
        this.logger.info('Database schema initialized successfully');
        resolve();
      });
    });
  }

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          this.logger.error('Database query failed', err);
          reject(err);
          return;
        }
        resolve(rows as T[]);
      });
    });
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          this.logger.error('Database operation failed', err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) {
          this.logger.error('Failed to close database connection', err);
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
}