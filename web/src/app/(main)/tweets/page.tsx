'use client';

import { useState, useEffect } from 'react';
import { Card, Title, Text, Button, Select, SelectItem, TextInput, DateRangePicker, Grid, Badge } from '@tremor/react';
import { Tweet } from '@/types/tweet';
import { Topic } from '@/types/topic';

export default function TweetsPage() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [sentToTelegram, setSentToTelegram] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch topics on component mount
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await fetch('/api/topics');
        const data = await res.json();
        
        if (data.success) {
          setTopics(data.data);
        } else {
          setError('Failed to fetch topics');
        }
      } catch (error) {
        setError('An error occurred while fetching topics');
        console.error(error);
      }
    };
    
    fetchTopics();
  }, []);

  // Fetch tweets with current filters
  useEffect(() => {
    fetchTweets();
  }, [selectedTopicId, sentToTelegram, dateRange]);

  const fetchTweets = async () => {
    setIsLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      
      if (selectedTopicId) {
        params.append('topicId', selectedTopicId);
      }
      
      if (sentToTelegram !== 'all') {
        params.append('sentToTelegram', sentToTelegram === 'sent' ? 'true' : 'false');
      }
      
      if (searchText) {
        params.append('searchText', searchText);
      }
      
      if (dateRange.from) {
        params.append('startDate', dateRange.from.toISOString());
      }
      
      if (dateRange.to) {
        params.append('endDate', dateRange.to.toISOString());
      }
      
      // Limit to 50 tweets for performance
      params.append('limit', '50');
      
      const res = await fetch(`/api/tweets?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setTweets(data.data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch tweets');
      }
    } catch (error) {
      setError('An error occurred while fetching tweets');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = () => {
    fetchTweets();
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getTopicName = (topicId: string) => {
    const topic = topics.find(t => t.id.toString() === topicId);
    return topic ? topic.name : topicId;
  };

  return (
    <div className="p-4">
      <div className="mb-6">
        <Title>Tweet Browser</Title>
        <Text>Search and view tweets from the database</Text>
      </div>
      
      {error && (
        <Card className="mb-6 bg-red-50 border-red-200">
          <Text className="text-red-700">{error}</Text>
        </Card>
      )}
      
      <Card className="mb-6">
        <div className="space-y-4">
          <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-4">
            <div>
              <Text className="mb-2">Topic</Text>
              <Select
                value={selectedTopicId}
                onValueChange={setSelectedTopicId}
                placeholder="All Topics"
              >
                <SelectItem value="">All Topics</SelectItem>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id.toString()}>
                    {topic.name}
                  </SelectItem>
                ))}
              </Select>
            </div>
            
            <div>
              <Text className="mb-2">Status</Text>
              <Select
                value={sentToTelegram}
                onValueChange={setSentToTelegram}
                placeholder="All Tweets"
              >
                <SelectItem value="all">All Tweets</SelectItem>
                <SelectItem value="sent">Sent to Telegram</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </Select>
            </div>
            
            <div className="col-span-1 sm:col-span-2 lg:col-span-2">
              <Text className="mb-2">Date Range</Text>
              <DateRangePicker
                value={dateRange}
                onValueChange={setDateRange}
                placeholder="Select date range"
              />
            </div>
          </Grid>
          
          <div className="flex space-x-4">
            <div className="flex-grow">
              <TextInput
                placeholder="Search tweet content"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>Search</Button>
          </div>
        </div>
      </Card>
      
      <div className="space-y-4">
        {isLoading ? (
          <Card>
            <Text>Loading tweets...</Text>
          </Card>
        ) : tweets.length === 0 ? (
          <Card>
            <Text>No tweets found matching your criteria.</Text>
          </Card>
        ) : (
          tweets.map((tweet) => (
            <Card key={tweet.id} className="overflow-hidden">
              <div className="flex items-start space-x-4">
                {tweet.tweetBy.profileImageUrl && (
                  <img
                    src={tweet.tweetBy.profileImageUrl}
                    alt={tweet.tweetBy.name}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <div className="flex-grow">
                  <div className="flex justify-between items-start">
                    <div>
                      <Text className="font-bold">{tweet.tweetBy.name}</Text>
                      <Text className="text-gray-500">@{tweet.tweetBy.userName}</Text>
                    </div>
                    <div className="flex space-x-2">
                      <Badge color={tweet.metadata.sentToTelegram ? 'green' : 'red'}>
                        {tweet.metadata.sentToTelegram ? 'Sent' : 'Rejected'}
                      </Badge>
                      <Badge color="blue">
                        {getTopicName(tweet.metadata.topicId)}
                      </Badge>
                    </div>
                  </div>
                  
                  <Text className="mt-2 whitespace-pre-wrap">{tweet.text}</Text>
                  
                  {tweet.engagement && (
                    <div className="mt-2 flex space-x-4 text-gray-500 text-sm">
                      <span>💬 {tweet.engagement.replyCount}</span>
                      <span>🔄 {tweet.engagement.retweetCount}</span>
                      <span>❤️ {tweet.engagement.likeCount}</span>
                      {tweet.engagement.viewCount && (
                        <span>👁️ {tweet.engagement.viewCount}</span>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-2 text-gray-500 text-sm">
                    <span>Created: {formatDate(tweet.createdAt)}</span>
                    <span className="ml-4">Captured: {formatDate(tweet.metadata.capturedAt)}</span>
                  </div>
                  
                  {!tweet.metadata.sentToTelegram && tweet.metadata.rejectionReason && (
                    <div className="mt-2">
                      <Badge color="amber">
                        Reason: {tweet.metadata.rejectionReason}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
