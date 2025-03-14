import { Card, Title, Text, Grid, Metric } from '@tremor/react';
import Link from 'next/link';

async function getStats() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/stats`, {
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch stats');
    }
    
    return res.json();
  } catch (error) {
    console.error('Error fetching stats:', error);
    return { data: { totalTweets: 0, sentTweets: 0, rejectedTweets: 0 } };
  }
}

async function getTopicStats() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/topics/stats`, {
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch topic stats');
    }
    
    return res.json();
  } catch (error) {
    console.error('Error fetching topic stats:', error);
    return { data: { activeTopics: 0, totalTopics: 0 } };
  }
}

async function getFilterStats() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/filters/stats`, {
      cache: 'no-store'
    });
    
    if (!res.ok) {
      throw new Error('Failed to fetch filter stats');
    }
    
    return res.json();
  } catch (error) {
    console.error('Error fetching filter stats:', error);
    return { data: { totalFilters: 0 } };
  }
}

export default async function HomePage() {
  const statsPromise = getStats();
  const topicStatsPromise = getTopicStats();
  const filterStatsPromise = getFilterStats();
  
  const [statsResponse, topicStatsResponse, filterStatsResponse] = await Promise.all([
    statsPromise,
    topicStatsPromise,
    filterStatsPromise
  ]);
  
  const stats = statsResponse.data;
  const topicStats = topicStatsResponse.data;
  const filterStats = filterStatsResponse.data;
  
  return (
    <div className="p-4">
      <div className="mb-6">
        <Title>Twitter Notification Dashboard</Title>
        <Text>Monitor and manage Twitter notifications sent to Telegram</Text>
      </div>
      
      <Grid numItems={1} numItemsSm={2} numItemsLg={4} className="gap-6 mb-6">
        <Card className="relative">
          <Text>Total Tweets</Text>
          <Metric>{stats.totalTweets}</Metric>
          <div className="absolute bottom-4 right-4">
            <Link href="/tweets" className="text-blue-500 hover:underline">
              View All
            </Link>
          </div>
        </Card>
        <Card className="relative">
          <Text>Sent to Telegram</Text>
          <Metric>{stats.sentTweets}</Metric>
          <div className="absolute bottom-4 right-4">
            <Link href="/tweets?sentToTelegram=sent" className="text-blue-500 hover:underline">
              View Sent
            </Link>
          </div>
        </Card>
        <Card className="relative">
          <Text>Active Topics</Text>
          <Metric>{topicStats.activeTopics}</Metric>
          <div className="absolute bottom-4 right-4">
            <Link href="/dashboard" className="text-blue-500 hover:underline">
              View Stats
            </Link>
          </div>
        </Card>
        <Card className="relative">
          <Text>Total Filters</Text>
          <Metric>{filterStats.totalFilters}</Metric>
          <div className="absolute bottom-4 right-4">
            <Link href="/filters" className="text-blue-500 hover:underline">
              Manage
            </Link>
          </div>
        </Card>
      </Grid>
      
      <Grid numItems={1} numItemsLg={2} className="gap-6 mb-6">
        <Card>
          <Title>Quick Actions</Title>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Link href="/dashboard">
              <Card className="hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-100 p-3 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <Text className="font-medium">View Dashboard</Text>
                    <Text className="text-gray-500">See statistics and metrics</Text>
                  </div>
                </div>
              </Card>
            </Link>
            <Link href="/tweets">
              <Card className="hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="bg-indigo-100 p-3 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </div>
                  <div>
                    <Text className="font-medium">Browse Tweets</Text>
                    <Text className="text-gray-500">Search and view tweets</Text>
                  </div>
                </div>
              </Card>
            </Link>
            <Link href="/filters">
              <Card className="hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="bg-green-100 p-3 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                  </div>
                  <div>
                    <Text className="font-medium">Manage Filters</Text>
                    <Text className="text-gray-500">Add or remove filters</Text>
                  </div>
                </div>
              </Card>
            </Link>
            <Link href="/tweets?sentToTelegram=rejected">
              <Card className="hover:bg-gray-50 transition-colors">
                <div className="flex items-center space-x-4">
                  <div className="bg-red-100 p-3 rounded-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <Text className="font-medium">View Rejected</Text>
                    <Text className="text-gray-500">See rejected tweets</Text>
                  </div>
                </div>
              </Card>
            </Link>
          </div>
        </Card>
        
        <Card>
          <Title>System Overview</Title>
          <div className="mt-4 space-y-4">
            <div>
              <Text className="font-medium">Tweet Processing</Text>
              <div className="flex justify-between mt-1">
                <Text>Sent to Telegram</Text>
                <Text className="font-medium">
                  {stats.totalTweets > 0
                    ? `${((stats.sentTweets / stats.totalTweets) * 100).toFixed(1)}%`
                    : '0%'}
                </Text>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ 
                    width: `${stats.totalTweets > 0 
                      ? ((stats.sentTweets / stats.totalTweets) * 100) 
                      : 0}%` 
                  }}
                ></div>
              </div>
            </div>
            
            <div>
              <Text className="font-medium">Topics</Text>
              <div className="flex justify-between mt-1">
                <Text>Active Topics</Text>
                <Text className="font-medium">
                  {topicStats.totalTopics > 0
                    ? `${((topicStats.activeTopics / topicStats.totalTopics) * 100).toFixed(1)}%`
                    : '0%'}
                </Text>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
                <div 
                  className="bg-green-600 h-2.5 rounded-full" 
                  style={{ 
                    width: `${topicStats.totalTopics > 0 
                      ? ((topicStats.activeTopics / topicStats.totalTopics) * 100) 
                      : 0}%` 
                  }}
                ></div>
              </div>
            </div>
            
            <div className="pt-4 border-t">
              <Text className="font-medium">About</Text>
              <Text className="mt-2">
                This dashboard provides a web interface for the Twitter Notification system that monitors Twitter accounts and forwards tweets to Telegram groups/channels.
              </Text>
              <Text className="mt-2">
                Use the navigation to access detailed statistics, browse tweets, and manage filters.
              </Text>
            </div>
          </div>
        </Card>
      </Grid>
    </div>
  );
}
