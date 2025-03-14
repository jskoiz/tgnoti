import { Card, Title, Text, Grid, Metric, Tab, TabGroup, TabList, TabPanel, TabPanels, Flex, Badge } from '@tremor/react';
import TweetAreaChart from '@/components/ui/dashboard/TweetAreaChart';
import TweetBarChart from '@/components/ui/dashboard/TweetBarChart';
import TweetDonutChart from '@/components/ui/dashboard/TweetDonutChart';
import CompetitorBarChart from '@/components/ui/dashboard/CompetitorBarChart';
import CompetitorVsTrojanChart from '@/components/ui/dashboard/CompetitorVsTrojanChart';
import TopUsersList from '@/components/ui/dashboard/TopUsersList';
import NotableUsersList from '@/components/ui/dashboard/NotableUsersList';
import EngagementLineChart from '@/components/ui/dashboard/EngagementLineChart';

async function getStats() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/stats`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch stats');
  }
  
  return res.json();
}

async function getHistoricalData() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/historical?days=14`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch historical data');
  }
  
  return res.json();
}

async function getCompetitorStats() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/competitor-stats`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch competitor stats');
  }
  
  return res.json();
}

async function getCompetitorVsTrojanData() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/competitor-vs-trojan?days=14`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch competitor vs trojan data');
  }
  
  return res.json();
}

async function getTopUsers() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/top-users?limit=10`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch top users data');
  }
  
  return res.json();
}

async function getNotableUsers() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/notable-users?limit=10`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch notable users data');
  }
  
  return res.json();
}

async function getEngagementOverTime() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/tweets/engagement-over-time?days=14`, {
    cache: 'no-store'
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch engagement over time data');
  }
  
  return res.json();
}

export default async function DashboardPage() {
  const [
    statsResponse, 
    historicalResponse, 
    competitorStatsResponse,
    competitorVsTrojanResponse,
    topUsersResponse,
    notableUsersResponse,
    engagementOverTimeResponse
  ] = await Promise.all([
    getStats(),
    getHistoricalData(),
    getCompetitorStats(),
    getCompetitorVsTrojanData(),
    getTopUsers(),
    getNotableUsers(),
    getEngagementOverTime()
  ]);
  
  const stats = statsResponse.data;
  const historicalData = historicalResponse.data;
  const competitorStats = competitorStatsResponse.data;
  const competitorVsTrojanData = competitorVsTrojanResponse.data;
  const topUsersData = topUsersResponse.data;
  const notableUsersData = notableUsersResponse.data;
  const engagementOverTimeData = engagementOverTimeResponse.data;
  
  // Calculate efficiency percentage
  const efficiencyPercentage = stats.totalTweets > 0
    ? ((stats.sentTweets / stats.totalTweets) * 100).toFixed(1)
    : "0";
  
  // Get badge color based on efficiency
  const getEfficiencyBadgeColor = (efficiency: number) => {
    if (efficiency >= 90) return "green";
    if (efficiency >= 70) return "blue";
    if (efficiency >= 50) return "yellow";
    return "red";
  };
  
  return (
    <div className="p-4">
      <div className="mb-6">
        <Flex justifyContent="between" alignItems="center">
          <div>
            <Title>Tweet Statistics Dashboard</Title>
            <Text>Real-time metrics and analytics for tweet monitoring</Text>
          </div>
          <Badge size="xl" color={getEfficiencyBadgeColor(parseFloat(efficiencyPercentage))}>
            {efficiencyPercentage}% Delivery Rate
          </Badge>
        </Flex>
      </div>
      
      <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-6 mb-6">
        <Card decoration="top" decorationColor="blue">
          <Flex justifyContent="start" alignItems="center" className="space-x-4">
            <div className="rounded-full bg-blue-100 p-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <Text>Total Tweets</Text>
              <Metric>{stats.totalTweets.toLocaleString()}</Metric>
            </div>
          </Flex>
        </Card>
        <Card decoration="top" decorationColor="green">
          <Flex justifyContent="start" alignItems="center" className="space-x-4">
            <div className="rounded-full bg-green-100 p-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <Text>Sent to Telegram</Text>
              <Metric>{stats.sentTweets.toLocaleString()}</Metric>
            </div>
          </Flex>
        </Card>
        <Card decoration="top" decorationColor="red">
          <Flex justifyContent="start" alignItems="center" className="space-x-4">
            <div className="rounded-full bg-red-100 p-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <div>
              <Text>Rejected Tweets</Text>
              <Metric>{stats.rejectedTweets.toLocaleString()}</Metric>
            </div>
          </Flex>
        </Card>
      </Grid>
      
      <TabGroup className="mt-6">
        <TabList>
          <Tab>Tweet Analytics</Tab>
          <Tab>Competitor Analysis</Tab>
          <Tab>User Insights</Tab>
          <Tab>Engagement Metrics</Tab>
        </TabList>
        
        <TabPanels>
          {/* Tweet Analytics Tab */}
          <TabPanel>
            <Grid numItems={1} numItemsLg={2} className="gap-6 mt-6">
              <Card className="p-4">
                <TweetAreaChart data={historicalData} />
              </Card>
              <Card className="p-4">
                <TweetBarChart
                  data={stats.topicBreakdown.map((item: any) => ({
                    topic: item._id,
                    count: item.count
                  }))}
                />
              </Card>
            </Grid>
            
            <Card className="mt-6 p-4">
              <TweetDonutChart
                data={stats.rejectionReasons.map((item: any) => ({
                  reason: item._id || 'unknown',
                  count: item.count
                }))}
              />
            </Card>
          </TabPanel>
          
          {/* Competitor Analysis Tab */}
          <TabPanel>
            <Grid numItems={1} numItemsLg={2} className="gap-6 mt-6">
              <Card className="p-4">
                <CompetitorVsTrojanChart
                  className="h-72 mt-4"
                  data={competitorVsTrojanData}
                />
              </Card>
              <Card className="p-4">
                <CompetitorBarChart
                  className="h-72 mt-4"
                  data={competitorStats || []}
                />
              </Card>
            </Grid>
            
            <Grid numItems={1} numItemsSm={2} className="gap-6 mt-6">
              <Card className="p-4">
                <Title className="text-base font-medium">Top Competitor</Title>
                {competitorStats && competitorStats.length > 0 ? (
                  <div className="mt-4">
                    <Flex justifyContent="between">
                      <Text className="font-medium">{competitorStats[0].competitor}</Text>
                      <Text>{competitorStats[0].tweets + competitorStats[0].mentions} total activities</Text>
                    </Flex>
                    <Flex className="mt-2">
                      <Text>Tweets: {competitorStats[0].tweets}</Text>
                      <Text>Mentions: {competitorStats[0].mentions}</Text>
                    </Flex>
                  </div>
                ) : (
                  <Text className="mt-4">No competitor data available</Text>
                )}
              </Card>
              <Card className="p-4">
                <Title className="text-base font-medium">Competitor Engagement</Title>
                {competitorStats && competitorStats.length > 0 ? (
                  <div className="mt-4">
                    <Flex justifyContent="between">
                      <Text>Total Tweets</Text>
                      <Text className="font-medium">
                        {competitorStats.reduce((acc: number, item: any) => acc + item.tweets, 0)}
                      </Text>
                    </Flex>
                    <Flex justifyContent="between" className="mt-2">
                      <Text>Total Mentions</Text>
                      <Text className="font-medium">
                        {competitorStats.reduce((acc: number, item: any) => acc + item.mentions, 0)}
                      </Text>
                    </Flex>
                  </div>
                ) : (
                  <Text className="mt-4">No competitor data available</Text>
                )}
              </Card>
            </Grid>
          </TabPanel>
          
          {/* User Insights Tab */}
          <TabPanel>
            <Grid numItems={1} numItemsLg={2} className="gap-6 mt-6">
              <Card className="p-4">
                <TopUsersList
                  className="h-96 mt-4"
                  data={topUsersData || []}
                />
              </Card>
              <Card className="p-4">
                <NotableUsersList
                  className="h-96 mt-4"
                  data={notableUsersData || []}
                />
              </Card>
            </Grid>
          </TabPanel>
          
          {/* Engagement Metrics Tab */}
          <TabPanel>
            <Card className="mt-6 p-4">
              <EngagementLineChart
                className="h-80 mt-4"
                data={engagementOverTimeData || []}
              />
            </Card>
          </TabPanel>
        </TabPanels>
      </TabGroup>
    </div>
  );
}
