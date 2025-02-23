/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  jitter?: boolean;
}

/**
 * Default retry policy values
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  jitter: true
};

/**
 * Calculate delay for a retry attempt using exponential backoff
 */
export function calculateRetryDelay(attempt: number, policy: RetryPolicy): number {
  const exponentialDelay = policy.baseDelay * Math.pow(2, attempt - 1);
  const delay = Math.min(exponentialDelay, policy.maxDelay);
  
  if (!policy.jitter) {
    return delay;
  }

  // Add random jitter between 0-25% of the delay
  const jitterMax = delay * 0.25;
  const jitterAmount = Math.random() * jitterMax;
  return delay + jitterAmount;
}

/**
 * Validate a retry policy configuration
 */
export function validateRetryPolicy(policy: Partial<RetryPolicy>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof policy.maxAttempts !== 'number' || policy.maxAttempts < 1) {
    errors.push('maxAttempts must be a positive number');
  }

  if (typeof policy.baseDelay !== 'number' || policy.baseDelay < 0) {
    errors.push('baseDelay must be a non-negative number');
  }

  if (typeof policy.maxDelay !== 'number' || policy.maxDelay < 0) {
    errors.push('maxDelay must be a non-negative number');
  }

  // Only check maxDelay vs baseDelay if both are valid numbers
  if (
    typeof policy.maxDelay === 'number' && 
    typeof policy.baseDelay === 'number' && 
    policy.maxDelay < policy.baseDelay
  ) {
    errors.push('maxDelay must be greater than or equal to baseDelay');
  }

  if (policy.jitter !== undefined && typeof policy.jitter !== 'boolean') {
    errors.push('jitter must be a boolean when specified');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}