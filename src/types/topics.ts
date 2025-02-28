import { FilterType } from './filters.js';

export interface TopicConfig {
  id: string;
  name: string;
  fallbackId?: string;
  isRequired?: boolean;
}

export interface TopicNotification {
  enabled: boolean;
}

export interface TopicDetails {
  id: number;
  notification: TopicNotification;
  filters: TopicFilter[];
}

// Re-export the filter type to avoid another import
export interface TopicFilter {
  type: FilterType;
  value: string;
}