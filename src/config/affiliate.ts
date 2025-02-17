import { AffiliateConfig } from '../types/affiliate.js';
import { Rettiwt } from 'rettiwt-api';

export const getAffiliateConfig = (apiKey: string): AffiliateConfig => ({
  apiKey,
  checkIntervalMinutes: 5, // Check every 5 minutes
  cacheTimeMinutes: 2, // Cache results for 2 minutes
  maxRetries: 3, // Maximum number of retries for failed requests
  retryDelayMs: 1000, // Initial delay between retries (will use exponential backoff)
});

export const initializeRettiwtClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error('Rettiwt API key is required');
  }

  return new Rettiwt({ apiKey });
};