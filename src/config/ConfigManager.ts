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

  constructor(@inject(TYPES.Logger) private logger: Logger) {}

  async initialize(): Promise<void> {
    this.logger.info('Initializing configuration manager');
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

    const value = process.env[key];
    if (!value) {
      const validation = this.validations.get(key);
      if (validation) {
        this.logger.error(`Missing required environment variable: ${key}`);
        this.logger.error('Required:');
        validation.required.forEach(req => this.logger.error(`- ${req}`));
        this.logger.error(`Example: ${validation.example}`);
      } else {
        this.logger.error(`Missing environment variable: ${key}`);
      }
      throw new Error(`Missing environment variable: ${key}`);
    }

    // Validate if validation exists
    const validation = this.validations.get(key);
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
    let hasError = false;

    for (const [key, validation] of this.validations.entries()) {
      try {
        const value = process.env[key];
        if (!value) {
          hasError = true;
          continue;
        }
        if (!validation.validate(value)) {
          hasError = true;
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