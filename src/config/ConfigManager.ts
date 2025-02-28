import { injectable, inject } from 'inversify';
import { Logger } from '../types/logger.js';
import { TYPES } from '../types/di.js';

export interface ConfigValidation<T> {
  validate: (value: T) => boolean;
  message: string;
  example: string;
  required: string[];
}

export interface ConfigItem<T> {
  key: string;
  value: T;
  validation?: ConfigValidation<T>;
}

@injectable()
export class ConfigManager {
  private configCache: Map<string, any> = new Map();
  private validations: Map<string, ConfigValidation<any>> = new Map();

  constructor(
    @inject(TYPES.Logger) private readonly logger: Logger
  ) {
    if (!this.logger) {
      throw new Error('Logger is required but was not injected');
    }
  }

  initialize(): void {
    this.logger.info('Initializing configuration manager');
    this.logger.debug('Current environment variables:', { env: process.env });
    this.validateAll();
  }

  registerValidation<T>(key: string, validation: ConfigValidation<T>): void {
    this.validations.set(key, validation);
  }

  getEnvConfig<T>(key: string): T {
    // Check cache first
    if (this.configCache.has(key)) {
      return this.configCache.get(key) as T;
    }

    // Log the current state
    this.logger.debug('Getting environment config', {
      key,
      currentValue: process.env[key],
      hasValidation: !!this.validations.get(key)
    });
    const value = process.env[key];

    const validation = this.validations.get(key);
    
    if (!value) {
      // Only throw error if the config is required (has validation)
      if (validation && validation.required.length > 0) {
        this.logger.error(`Missing required environment variable: ${key}`);
        this.logger.error('Required:');
        validation.required.forEach(req => this.logger.error(`- ${req}`));
        this.logger.error(`Example: ${validation.example}`);
        throw new Error(`Missing required environment variable: ${key}`);
      }
      // Return undefined for optional environment variables
      return undefined as T;
    }

    // Validate if validation exists
    if (validation && !validation.validate(value)) {
      this.logger.error(`${validation.message}: ${key}`);
      this.logger.error('Required:');
      validation.required.forEach(req => this.logger.error(`- ${req}`));
      this.logger.error(`Example: ${validation.example}`);
      throw new Error(`Invalid configuration value for ${key}`);
    }

    // Cache the value
    this.configCache.set(key, value);
    return value as T;
  }

  validateAll(): void {
    this.logger.info('Validating all environment variables');
    let hasError = false;

    for (const [key, validation] of this.validations.entries()) {
      try {
        const value = process.env[key];
        if (!value) {
          hasError = true;
          this.logger.error(`Missing required variable: ${key}`, undefined, {
            required: validation.required,
            example: validation.example
          });
          continue;
        }
        if (!validation.validate(value)) {
          hasError = true;
          this.logger.error(`Invalid value for ${key}`, undefined, {
            value,
            required: validation.required,
            example: validation.example
          });
        } else {
          this.logger.debug(`Validated ${key}`, {
            value
          });
        }
      } catch (error) {
        hasError = true;
      }
    }

    if (hasError) {
      throw new Error('Configuration validation failed. Please check your .env file.');
    }
  }
}