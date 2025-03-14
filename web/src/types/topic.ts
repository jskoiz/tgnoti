export interface Topic {
  id: number;
  name: string;
  description?: string;
  telegramGroupId?: string;
  telegramTopicId?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TopicQueryOptions {
  isActive?: boolean;
}
