import { injectable, inject } from 'inversify';
import { SearchQueryConfig, RawSearchQueryConfig, StructuredSearchQueryConfig } from '../types/storage.js';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';
import { ConfigManager, ConfigValidation } from './ConfigManager.js';

@injectable()
export class TwitterConfigValidator {
  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.ConfigManager) private configManager: ConfigManager
  ) {
    this.registerValidations();
  }

  private registerValidations(): void {
    const searchQueryValidation: ConfigValidation<{ [key: string]: SearchQueryConfig }> = {
      validate: (queries) => {
        try {
          this.validateTwitterConfig(queries);
          return true;
        } catch (error) {
          return false;
        }
      },
      message: 'Invalid Twitter search query configuration',
      example: `{
        "competitors": {
          "type": "structured",
          "mentions": ["@competitor1", "@competitor2"],
          "operator": "OR"
        }
      }`,
      required: [
        'Must specify query type ("raw" or "structured")',
        'Raw queries must use "from:" or "@" syntax',
        'Structured queries must include mentions array'
      ]
    };

    this.configManager.registerValidation('TWITTER_SEARCH_QUERIES', searchQueryValidation);
  }

  private validateRawQuery(config: RawSearchQueryConfig, topicId: string): boolean {
    if (!config.query) {
      throw new Error(`Missing query for topic: ${topicId}`);
    }

    // Validate query format
    const validQueryParts = config.query.split(' OR ').every((part: string) => 
      part.startsWith('from:') || part.startsWith('@')
    );

    if (!validQueryParts) {
      throw new Error(`Invalid query format for topic ${topicId}. Each part must start with 'from:' or '@'`);
    }

    return true;
  }

  private validateStructuredQuery(config: StructuredSearchQueryConfig, topicId: string): boolean {
    if (!config.mentions || config.mentions.length === 0) {
      throw new Error(`Missing mentions for structured query in topic: ${topicId}`);
    }

    if (config.operator && !['AND', 'OR'].includes(config.operator)) {
      throw new Error(`Invalid operator "${config.operator}" for topic ${topicId}. Must be "AND" or "OR"`);
    }

    return true;
  }

  validateTwitterConfig(searchQueries: { [key: string]: SearchQueryConfig }): boolean {
    for (const [topicId, config] of Object.entries(searchQueries)) {
      if (!config.type) {
        throw new Error(`Missing type for topic: ${topicId}. Must be "raw" or "structured"`);
      }

      config.type === 'raw' ? this.validateRawQuery(config, topicId) : this.validateStructuredQuery(config, topicId);
    }

    return true;
  }
}
