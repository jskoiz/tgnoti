import { injectable, inject } from 'inversify';
import { TYPES } from '../../types/di.js';
import { Logger } from '../../types/logger.js';
import { Environment } from '../../config/environment.js';
import { RateLimitConfig } from '../../config/twitter.js';

@injectable()
export class RateLimitManager {
  private defaultConfig: RateLimitConfig = {
    requestsPerSecond: 1,
    safetyFactor: 1.0,
  };

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Environment) private environment: Environment
  ) {
    this.logger.setComponent('RateLimitManager');
  }

  initialize(): void {
    const config = this.getRateLimit();
    if (!this.validateRateLimit(config)) {
      throw new Error('Invalid rate limit configuration');
    }
    this.logger.info('Rate limit manager initialized', {
      component: 'RateLimitManager',
      config
    });
  }

  getRateLimit(): RateLimitConfig {
    return this.environment.getConfig().twitter.rateLimit;
  }

  validateRateLimit(config: RateLimitConfig): boolean {
    return (
      config.requestsPerSecond > 0 &&
      config.safetyFactor > 0
    );
  }
}