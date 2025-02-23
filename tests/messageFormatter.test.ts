import { TweetUser, Tweet } from '../src/types/twitter.js';

describe('Message Formatter', () => {
  const mockUser: TweetUser = {
    userName: 'testuser',
    displayName: 'Test User',
    fullName: 'Test User',
    description: 'Test user description',
    followersCount: 100,
    followingCount: 50,
    statusesCount: 1000,
    verified: false,
    isVerified: false,
    verifiedType: 'none',
    createdAt: '2024-01-01T00:00:00Z'
  };

  const mockTweet: Tweet = {
    id: '123456789',
    text: 'Test tweet content',
    createdAt: '2025-02-21T00:00:00Z',
    tweetBy: mockUser,
    replyCount: 0,
    retweetCount: 0,
    likeCount: 0,
    viewCount: 0
  };

  // ... rest of your test cases ...
});