export interface Tweet {
  id: string;
  text: string;
  tweetBy: {
    id: string;
    name: string;
    userName: string;
    profileImageUrl: string;
  };
  engagement?: {
    replyCount: number;
    retweetCount: number;
    likeCount: number;
    viewCount?: number;
  };
  media?: {
    photos?: string[];
    videos?: string[];
    gifs?: string[];
  };
  metadata: {
    topicId: string;
    capturedAt: Date;
    sentToTelegram: boolean;
    rejectionReason?: string;
  };
  createdAt: Date;
}

export interface TweetQueryOptions {
  limit?: number;
  topicId?: string;
  sentToTelegram?: boolean;
  startDate?: Date;
  endDate?: Date;
  searchText?: string;
}
