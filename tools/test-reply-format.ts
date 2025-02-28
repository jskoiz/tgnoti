import { EnhancedMessageFormatter } from '../src/telegram/bot/messageFormatter.js';
import { Tweet, TweetUser } from '../src/types/twitter.js';

// Mock tweet user
const mockUser: TweetUser = {
  userName: 'testuser',
  displayName: 'Test User',
  fullName: 'Test User',
  followersCount: 1000,
  followingCount: 500,
  statusesCount: 100,
  verified: false,
  isVerified: false,
  createdAt: new Date().toISOString()
};

// Mock reply to tweet
const replyToTweet: Tweet = {
  id: '123456',
  text: 'Original tweet with an image',
  createdAt: new Date().toISOString(),
  tweetBy: {
    ...mockUser,
    userName: 'originaluser',
    displayName: 'Original User'
  },
  replyCount: 5,
  retweetCount: 10,
  likeCount: 20,
  viewCount: 100,
  media: [{
    url: 'https://example.com/image1.jpg',
    type: 'photo'
  }]
};

// Mock reply tweet
const replyTweet: Tweet = {
  id: '789012',
  text: 'This is a reply with multiple images',
  createdAt: new Date().toISOString(),
  tweetBy: mockUser,
  replyCount: 2,
  retweetCount: 3,
  likeCount: 5,
  viewCount: 50,
  replyToTweet,
  media: [
    {
      url: 'https://example.com/reply1.jpg',
      type: 'photo'
    },
    {
      url: 'https://example.com/reply2.jpg',
      type: 'photo'
    }
  ]
};

// Test the formatter
const formatter = new EnhancedMessageFormatter();
const formattedMessage = formatter.formatMessage({
  tweet: replyTweet,
  replyToTweet,
  mediaHandling: 'inline'
});

console.log('Formatted Message:');
console.log('=================');
console.log(formattedMessage);