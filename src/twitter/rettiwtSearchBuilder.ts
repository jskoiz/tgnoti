import { injectable, inject } from 'inversify';
import { TweetFilter } from 'rettiwt-api';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { SearchQueryConfig, RawSearchQueryConfig, StructuredSearchQueryConfig } from '../types/storage.js';

@injectable()
export class RettiwtSearchBuilder {
  constructor(@inject(TYPES.Logger) private logger: Logger) {}

  buildFilter(config: SearchQueryConfig): TweetFilter {
    if (config.type === 'raw') {
      return this.buildFromRawQuery(config);
    }
    return this.buildFromStructured(config);
  }

  private buildFromRawQuery(config: RawSearchQueryConfig): TweetFilter {
    // Parse raw query to extract usernames and mentions
    // Remove parentheses and split by OR
    const parts = config.query.replace(/[()]/g, '').split(' OR ');
    
    // Extract usernames (from:)
    const fromUsers = parts
      .filter(p => p.startsWith('from:'))
      .map(p => p.replace('from:', ''));

    // Extract mentions (@)
    const mentions = parts
      .filter(p => p.startsWith('@'))
      .map(p => p.replace('@', '').trim());

    // Extract keywords (anything not from: or @)
    const keywords = parts
      .filter(p => !p.startsWith('from:') && !p.startsWith('@'))
      .map(p => p.trim())
      .filter(p => p.length > 0);

    this.logger.debug(`Parsed raw query - fromUsers: ${fromUsers.join(', ')}, mentions: ${mentions.join(', ')}, keywords: ${keywords.join(', ')}`);

    const filter = {
      fromUsers: fromUsers.length > 0 ? fromUsers : undefined,
      mentions: mentions.length > 0 ? mentions : undefined,
      keywords: keywords.length > 0 ? keywords : undefined,
      language: config.language,
      minLikes: 0,
      minReplies: 0,
      minRetweets: 0,
      includeReplies: true,
      includeRetweets: !config.excludeRetweets,
      includeQuotes: true
    };

    this.logger.debug(`Built filter from raw query: ${JSON.stringify(filter)}`);
    return new TweetFilter(filter);
  }

  private buildFromStructured(config: StructuredSearchQueryConfig): TweetFilter {
    // Handle keywords based on operator
    let keywords: string[] | undefined;
    let phrase: string | undefined;

    if (config.keywords?.length) {
      if (config.operator === 'AND') {
        // For AND operator, combine keywords into a phrase
        phrase = config.keywords.join(' ');
      } else {
        // For OR operator, keep as separate words
        keywords = config.keywords;
      }
    }

    const filter = {
      fromUsers: config.accounts?.map(a => a.replace('@', '')),
      mentions: config.mentions?.map(m => m.replace('@', '')),
      keywords,
      phrase,
      language: config.language,
      startDate: config.startTime ? new Date(config.startTime) : undefined,
      minLikes: 0,
      minReplies: 0,
      minRetweets: 0,
      includeReplies: true,
      includeRetweets: !config.excludeRetweets,
      includeQuotes: !config.excludeQuotes
    };

    this.logger.debug(`Built filter from structured config: ${JSON.stringify(filter)}`);
    return new TweetFilter(filter);
  }
}