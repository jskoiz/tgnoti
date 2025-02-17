import { Rettiwt, User } from 'rettiwt-api';

export interface AffiliateChange {
  added: string[];
  removed: string[];
  timestamp: Date;
}

export interface AffiliateState {
  orgUsername: string;
  affiliates: string[];
  lastChecked: Date;
  lastChanged?: Date;
}

export interface AffiliateCheckResult {
  changes?: AffiliateChange;
  error?: Error;
  cached: boolean;
}

export interface IAffiliateMonitor {
  startMonitoring(orgUsername: string): Promise<void>;
  stopMonitoring(orgUsername: string): Promise<void>;
  checkAffiliates(orgUsername: string): Promise<AffiliateCheckResult>;
  getMonitoredOrgs(): Promise<string[]>;
}

export interface IAffiliateStorage {
  getAffiliates(orgUsername: string): Promise<string[]>;
  updateAffiliates(orgUsername: string, affiliates: string[]): Promise<void>;
  getMonitoredOrgs(): Promise<string[]>;
  addMonitoredOrg(orgUsername: string): Promise<void>;
  removeMonitoredOrg(orgUsername: string): Promise<void>;
  getAffiliateState(orgUsername: string): Promise<AffiliateState | null>;
  saveAffiliateState(state: AffiliateState): Promise<void>;
  getAffiliateHistory(orgUsername: string): Promise<AffiliateChange[]>;
  addAffiliateChange(orgUsername: string, change: AffiliateChange): Promise<void>;
}

export interface AffiliateConfig {
  apiKey: string;
  checkIntervalMinutes: number;
  cacheTimeMinutes: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface ClientEventItem {
  item_type: number;
  id: string;
  position?: number;
  account_taxonomy_details?: {
    user_label_type: string;
  };
  is_viewer_follows_user?: boolean;
  is_user_follows_viewer?: boolean;
}

export interface ClientEventResponse {
  items: ClientEventItem[];
}

export interface IAffiliateClient {
  fetchAffiliates(orgUsername: string): Promise<string[]>;
  getUserDetails(userId: string): Promise<User | undefined>;
}


export const AFFILIATE_TYPES = {
  AffiliateMonitor: Symbol.for('AffiliateMonitor'),
  AffiliateStorage: Symbol.for('AffiliateStorage'),
  AffiliateConfig: Symbol.for('AffiliateConfig'),
  RettiwtClient: Symbol.for('RettiwtClient'),
  AffiliateClient: Symbol.for('AffiliateClient'),
};

export type RettiwtClient = Rettiwt;

export const AFFILIATE_ENDPOINT = 'https://x.com/i/api/1.1/jot/client_event.json';
export const DEFAULT_CLIENT_LANGUAGE = 'en';
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible)';