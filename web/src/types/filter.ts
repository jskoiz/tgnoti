export interface TopicFilter {
  type: string;
  value: string;
}

export interface TopicFilterDocument extends TopicFilter {
  topicId: number;
  createdAt: Date;
  createdBy?: number;
}

export interface FilterQueryOptions {
  topicId?: number;
  type?: string;
}
