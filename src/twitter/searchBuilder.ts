import { injectable, inject } from 'inversify';
import { SearchConfig } from '../types/twitter.js';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';

@injectable()
export class SearchBuilder {
  constructor(@inject(TYPES.Logger) private logger: Logger) {
  }

  buildQuery(config: SearchConfig): string {
    // If raw query is provided, use it as the base
    if (config.rawQuery) {
      let query = config.rawQuery;
      if (config.excludeRetweets) {
        query += ' -is:retweet';
      }
      this.logger.debug(`Built query from raw: ${query}`);
      return query;
    }

    let mainParts: string[] = [];

    // Handle accounts (from:)
    if (config.accounts?.length) {
      const accounts = config.accounts.map(a => 
        `from:${a.replace('@', '')}`
      );
      mainParts.push(`(${accounts.join(' OR ')})`);
    }

    // Handle mentions (@)
    if (config.mentions?.length) {
      const mentions = config.mentions.map(m => m.replace('@', ''));
      mainParts.push(`(@${mentions.join(' OR @')})`);
    }

    // Handle excluded accounts
    if (config.excludeAccounts?.length) {
      config.excludeAccounts.forEach(a => {
        mainParts.push(`-from:${a.replace('@', '')}`);
      });
    }

    // Handle excluded tweet types
    if (config.excludeRetweets) {
      mainParts.push('-is:retweet');
    }
    if (config.excludeQuotes) {
      mainParts.push('-is:quote');
    }
    if (config.excludeReplies) {
      mainParts.push('-is:reply');
    }

    if (config.language) {
      mainParts.push(`lang:${config.language}`);
    }
    
    // Handle keywords based on operator
    if (config.keywords?.length) {
      const keywordQuery = `(${config.keywords.join(' OR ')})`;
      if (config.operator === 'AND') {
        mainParts.push(keywordQuery);
      } else {
        // For OR operator, combine mentions with keywords
        if (config.mentions?.length) {
          const mentionParts = mainParts.filter(p => p.startsWith('(@'));
          const otherParts = mainParts.filter(p => !p.startsWith('(@'));
          const combinedPart = `(${mentionParts[0].slice(1, -1)} OR ${keywordQuery})`;
          mainParts = [...otherParts, combinedPart];
        } else {
          mainParts.push(keywordQuery);
        }
      }
    }

    const query = mainParts.join(' ');
    this.logger.debug(`Built query from parts: ${query}`);
    return query;
  }
}