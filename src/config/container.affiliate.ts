import { Container } from 'inversify';
import { TYPES, AFFILIATE_TYPES } from '../types/di.js';
import { AffiliateMonitor } from '../core/AffiliateMonitor.js';
import { AffiliateStorage } from '../storage/affiliateStorage.js';
import { AffiliateClient } from '../core/AffiliateClient.js';
import { getAffiliateConfig, initializeRettiwtClient } from './affiliate.js';

export const configureAffiliateContainer = (container: Container, apiKey: string): void => {
  // Initialize Rettiwt client with API key
  const rettiwtClient = initializeRettiwtClient(apiKey);
  container.bind(AFFILIATE_TYPES.RettiwtClient).toConstantValue(rettiwtClient);

  // Bind affiliate config
  const affiliateConfig = getAffiliateConfig(apiKey);
  container.bind(AFFILIATE_TYPES.AffiliateConfig).toConstantValue(affiliateConfig);

  // Bind affiliate services
  container.bind(AFFILIATE_TYPES.AffiliateClient).to(AffiliateClient).inSingletonScope();
  container.bind(AFFILIATE_TYPES.AffiliateStorage).to(AffiliateStorage).inSingletonScope();
  container.bind(AFFILIATE_TYPES.AffiliateMonitor).to(AffiliateMonitor).inSingletonScope();
};