import { injectable, inject } from 'inversify';
import { Logger } from '../../types/logger.js';
import { TYPES } from '../../types/di.js';
import { Environment } from '../../config/environment.js';
import { MetricsManager } from '../monitoring/MetricsManager.js';

interface KeyHealth {
  errors: number;
  lastError: Date | null;
  rateLimitReset: Date | null;
  consecutiveFailures: number;
  lastSuccess: Date | null;
}

@injectable()
export class RettiwtKeyManager {
  private currentKeyIndex: number = 0;
  private apiKeys: string[] = [];
  private lastRotation: number = Date.now();
  private rotationInterval: number = 5 * 60 * 1000; // 5 minutes default
  private keyHealth: Map<string, KeyHealth> = new Map();
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly HEALTH_RESET_INTERVAL = 30 * 60 * 1000; // 30 minutes
  private readonly ERROR_THRESHOLD = 5;
  private readonly RATE_LIMIT_COOLDOWN = 20 * 60 * 1000; // 20 minutes
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    @inject(TYPES.Logger) private logger: Logger,
    @inject(TYPES.Environment) private environment: Environment,
    @inject(TYPES.MetricsManager) private metrics: MetricsManager
  ) {
    this.initializeKeys();
  }

  private initializeKeys(): void {
    const config = this.environment.getConfig();
    
    this.apiKeys = [
      config.twitter.api.keys.main,
      ...(config.twitter.api.keys.additional || [])
    ].filter(Boolean);
    
    // Deduplicate keys by auth_token and twid
    const uniqueKeys = new Map<string, string>();
    for (const key of this.apiKeys) {
      try {
        // Extract auth_token and twid from the key
        const authTokenMatch = key.match(/auth_token=([^;]+)/);
        const twidMatch = key.match(/twid=([^;]+)/);
        
        if (authTokenMatch && twidMatch) {
          const signature = `${authTokenMatch[1]}_${twidMatch[1]}`;
          uniqueKeys.set(signature, key);
        } else {
          uniqueKeys.set(key, key); // Use full key as fallback
        }
      } catch (error) {
        uniqueKeys.set(key, key); // Use full key as fallback
      }
    }
    
    this.apiKeys = Array.from(uniqueKeys.values());

    // Get all available API keys
    if (this.apiKeys.length === 0) {
      throw new Error('No Rettiwt API keys available');
    }

    // Enhanced initialization logging
    this.logger.info('Initializing API keys', {
      totalKeys: this.apiKeys.length,
      uniqueKeys: this.apiKeys.length,
      currentKeyIndex: this.currentKeyIndex,
      keyLengths: this.apiKeys.map(k => k.length),
      keyPrefixes: this.apiKeys.map(k => k.substring(0, 4))
    });
    
    // Initialize health tracking for each key
    this.apiKeys.forEach(key => {
      this.keyHealth.set(key, this.initKeyHealth());
    });
    
    this.startHealthCheck();
  }

  public getCurrentKey(): string {
    if (this.apiKeys.length === 0) {
      throw new Error('No API keys available');
    }
    
    // Add debug logging
    this.logger.debug('Getting current key', {
      currentKeyIndex: this.currentKeyIndex,
      totalKeys: this.apiKeys.length,
      keyExists: this.currentKeyIndex < this.apiKeys.length
    });
    
    return this.apiKeys[this.currentKeyIndex];
  }

  public getCurrentKeyIndex(): number {
    return this.currentKeyIndex;
  }

  private initKeyHealth(): KeyHealth {
    return {
      errors: 0,
      lastError: null,
      rateLimitReset: null,
      consecutiveFailures: 0,
      lastSuccess: null
    };
  }

  public setRotationInterval(intervalMs: number): void {
    this.rotationInterval = intervalMs;
    this.logger.debug(`Set key rotation interval to ${intervalMs}ms`);
  }

  public rotateKey(): string {
    if (this.apiKeys.length <= 1) {
      return this.getCurrentKey();
    }

    // Try to find the healthiest available key
    const healthyKey = this.findHealthyKey();
    if (healthyKey) {
      this.currentKeyIndex = this.apiKeys.indexOf(healthyKey);
      this.lastRotation = Date.now();
      this.logger.debug(`Rotated to healthy API key ${this.currentKeyIndex + 1} of ${this.apiKeys.length}`);
      return healthyKey;
    }

    // If no healthy key found, use time-based rotation
    if (Date.now() - this.lastRotation < this.rotationInterval) {
      return this.getCurrentKey();
    }

    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    this.lastRotation = Date.now();

    // Add rotation validation
    if (this.currentKeyIndex >= this.apiKeys.length) {
      this.logger.error('Invalid key index after rotation', new Error(`Key index ${this.currentKeyIndex} exceeds total keys ${this.apiKeys.length}`), { currentKeyIndex: this.currentKeyIndex, totalKeys: this.apiKeys.length });
      this.currentKeyIndex = 0;
      this.metrics.increment('twitter.key.index_reset');
    }
    
    this.logger.debug(`Rotated to API key ${this.currentKeyIndex + 1} of ${this.apiKeys.length}`);
    return this.getCurrentKey();
  }

  public markKeyError(error: any): void {
    const currentKey = this.getCurrentKey();
    const health = this.keyHealth.get(currentKey) || this.initKeyHealth();
    const now = Date.now();

    health.errors++;
    health.lastError = new Date();
    health.consecutiveFailures++;
    
    if (error?.status === 429 || error?.message?.includes('TOO_MANY_REQUESTS')) { // Rate limit error
      // Calculate a staggered cooldown to prevent all keys from resetting at the same time
      const cooldownTime = this.RATE_LIMIT_COOLDOWN + (this.currentKeyIndex * 60 * 1000);
      health.rateLimitReset = new Date(now + cooldownTime);
      this.logger.warn(`Rate limit hit on key ${this.currentKeyIndex + 1}, cooling down until ${health.rateLimitReset} (${cooldownTime/60000} minutes)`);
      this.metrics.increment('twitter.key.ratelimit');
    } else {
      this.metrics.increment('twitter.key.error');
    }

    this.keyHealth.set(currentKey, health);

    // Always rotate on error
    this.rotateKey();
    
    // Log the new key being used
    this.logger.info(`Switched to API key ${this.currentKeyIndex + 1} of ${this.apiKeys.length}`);
  }

  public getKeyCount(): number {
    return this.apiKeys.length;
  }

  public markKeySuccess(): void {
    const currentKey = this.getCurrentKey();
    const health = this.keyHealth.get(currentKey) || this.initKeyHealth();
    
    health.consecutiveFailures = 0;
    health.lastSuccess = new Date();
    
    this.keyHealth.set(currentKey, health);
    this.metrics.increment('twitter.key.success');
  }

  private findHealthyKey(): string {
    const now = Date.now();
    const healthyKeys: string[] = [];

    // Find all healthy keys
    for (const key of this.apiKeys) {
      try {
        const health = this.keyHealth.get(key);
        
        // New keys are considered healthy
        if (!health) {
          healthyKeys.push(key);
          continue;
        }

        // Check rate limit status
        if (health.rateLimitReset && health.rateLimitReset.getTime() > now) {
          continue;
        }

        // Check consecutive failures
        if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
          continue;
        }

        // Check error threshold
        if (health.errors >= this.ERROR_THRESHOLD && 
            health.lastError && 
            (now - health.lastError.getTime()) < this.HEALTH_RESET_INTERVAL) {
          continue;
        }

        healthyKeys.push(key);
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Error checking key health', errorObj);
      }
    }

    if (healthyKeys.length === 0) {
      return this.getCurrentKey();
    }

    // Sort by health metrics
    return healthyKeys.sort((a, b) => {
      const healthA = this.keyHealth.get(a) || this.initKeyHealth();
      const healthB = this.keyHealth.get(b) || this.initKeyHealth();

      // First compare by error count
      const errorDiff = healthA.errors - healthB.errors;
      if (errorDiff !== 0) return errorDiff;

      // Then by most recent success
      const timeA = healthA.lastSuccess ? healthA.lastSuccess.getTime() : 0;
      const timeB = healthB.lastSuccess ? healthB.lastSuccess.getTime() : 0;
      return timeB - timeA;
    })[0];
  }

  private isKeyUnhealthy(key: string): true | false {
    const health = this.keyHealth.get(key);
    if (!health) return false as const;
    
    const now = Date.now();
    
    // Check consecutive failures
    if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      return true as const;
    }
    
    // Check rate limit status
    if (health.rateLimitReset && health.rateLimitReset.getTime() > now) {
      return true as const;
    }
    
    // Check error threshold
    if (health.errors >= this.ERROR_THRESHOLD && health.lastError) {
      const timeSinceLastError = now - health.lastError.getTime();
      if (timeSinceLastError < this.HEALTH_RESET_INTERVAL) {
        return true as const;
      }
    }
    
    return false as const;
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.keyHealth.forEach((health, key) => {
        if (Date.now() - (health.lastError?.getTime() || 0) >= this.HEALTH_RESET_INTERVAL) {
          this.keyHealth.set(key, this.initKeyHealth());
          this.logger.debug(`Reset health metrics for API key`);
        }
      });
    }, this.HEALTH_RESET_INTERVAL);
  }
}