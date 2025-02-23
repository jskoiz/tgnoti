export type FilterType = 'user' | 'mention' | 'keyword';

export interface TopicFilter {
  id?: number;
  type: FilterType;
  value: string;
  createdAt?: Date;
  createdBy?: number;
}

export interface FilterPermission {
  canView: boolean;
  canModify: boolean;
}

export interface FilterOperationResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface TopicFilterRecord {
  id: number;
  topic_id: number;
  filter_type: FilterType;
  value: string;
  created_at: string;
  created_by: number | null;
}