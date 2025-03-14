import { Card, Title, Text, Grid, Metric, AreaChart, BarChart, DonutChart } from '@tremor/react';

async function getStats() {
  // In a real implementation, this would use SWR or React Query on the client side
  // For server components, we're fetching directly
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

export default async function DashboardPage() {
  const statsPromise = getStats();
  const historicalPromise = getHistoricalData();
  
  const [statsResponse, historicalResponse] = await Promise.all([
    statsPromise,
    historicalPromise
  ]);
  
  const stats = statsResponse.data;
  const historicalData = historicalResponse.data;
  
  return (
    <div className="p-4">
      <div className="mb-6">
        <Title>Tweet Statistics Dashboard</Title>
        <Text>Real-time metrics and analytics for tweet monitoring</Text>
      </div>
      
      <Grid numItems={1} numItemsSm={2} numItemsLg={3} className="gap-6 mb-6">
        <Card>
          <Text>Total Tweets</Text>
          <Metric>{stats.totalTweets}</Metric>
        </Card>
        <Card>
          <Text>Sent to Telegram</Text>
          <Metric>{stats.sentTweets}</Metric>
        </Card>
        <Card>
          <Text>Rejected Tweets</Text>
          <Metric>{stats.rejectedTweets}</Metric>
        </Card>
      </Grid>
      
      <Grid numItems={1} numItemsLg={2} className="gap-6 mb-6">
        <Card>
          <Title>Tweet Volume Over Time</Title>
          <AreaChart
            className="h-72 mt-4"
            data={historicalData}
            index="date"
            categories={["sent", "rejected"]}
            colors={["blue", "red"]}
            valueFormatter={(value) => `${value} tweets`}
          />
        </Card>
        <Card>
          <Title>Tweets by Topic</Title>
          <BarChart
            className="h-72 mt-4"
            data={stats.topicBreakdown.map((item: any) => ({
              topic: item._id,
              count: item.count
            }))}
            index="topic"
            categories={["count"]}
            colors={["blue"]}
            valueFormatter={(value) => `${value} tweets`}
          />
        </Card>
      </Grid>
      
      <Grid numItems={1} numItemsLg={2} className="gap-6">
        <Card>
          <Title>Rejection Reasons</Title>
          <DonutChart
            className="h-72 mt-4"
            data={stats.rejectionReasons.map((item: any) => ({
              reason: item._id || 'unknown',
              count: item.count
            }))}
            category="count"
            index="reason"
            valueFormatter={(value) => `${value} tweets`}
            colors={["blue", "cyan", "indigo", "violet", "fuchsia"]}
          />
        </Card>
        <Card>
          <Title>Tweet Processing Efficiency</Title>
          <div className="mt-4">
            <Text>Percentage of tweets sent to Telegram</Text>
            <Metric>
              {stats.totalTweets > 0
                ? `${((stats.sentTweets / stats.totalTweets) * 100).toFixed(1)}%`
                : '0%'}
            </Metric>
          </div>
        </Card>
      </Grid>
    </div>
  );
}
