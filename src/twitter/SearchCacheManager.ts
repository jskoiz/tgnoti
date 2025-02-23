import { injectable } from 'inversify';
import { Tweet, SearchQueryConfig } from '../types/twitter.js';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

@injectable()
export class SearchCacheManager {
  private cache: Map<string, CacheEntry<Tweet[]>> = new Map();
  private readonly TTL = 60000; // 60 seconds

  generateKey(config: SearchQueryConfig): string {
    const parts = [
      config.type,
      config.language,
      ...(config.accounts || []),
      ...(config.mentions || []),
      ...(config.keywords || []),
      config.startTime || '',
      config.endTime || '',
      config.excludeQuotes ? '1' : '0',
      config.excludeRetweets ? '1' : '0',
      config.minLikes?.toString() || '',
      config.minRetweets?.toString() || '',
      config.minReplies?.toString() || '',
      config.operator || '',
      Math.floor(Date.now() / this.TTL) // Time bucket for TTL
    ];
    
    return parts.join('_');
  }

  async get(config: SearchQueryConfig): Promise<Tweet[] | null> {
    const key = this.generateKey(config);
    const entry = this.cache.get(key);
    
    if (!entry || Date.now() > entry.expiresAt) {
      return null;
    }
    
    return entry.data;
  }

  set(config: SearchQueryConfig, data: Tweet[]): void {
    const key = this.generateKey(config);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.TTL
    });
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  // Run cleanup periodically
  startCleanupInterval(): void {
    setInterval(() => this.cleanup(), this.TTL);
  }
}