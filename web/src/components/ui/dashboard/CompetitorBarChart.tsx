"use client";

import { Badge, BarChart, Flex, Text, Title } from '@tremor/react';

interface CompetitorBarChartProps {
  data: {
    competitor: string;
    tweets: number;
    mentions: number;
    total?: number;
  }[];
  className?: string;
}

export default function CompetitorBarChart({ data, className }: CompetitorBarChartProps) {
  const valueFormatter = (value: number) => `${value}`;
  
  // Calculate totals for comparison
  const totalTweets = data.reduce((acc, item) => acc + item.tweets, 0);
  const totalMentions = data.reduce((acc, item) => acc + item.mentions, 0);
  
  // Sort data by total activity (tweets + mentions)
  const sortedData = [...data].sort((a, b) => 
    ((b.tweets + b.mentions) - (a.tweets + a.mentions))
  );
  
  // Get top competitor
  const topCompetitor = sortedData.length > 0 ? sortedData[0] : null;
  
  // Calculate percentage of total activity for the top competitor
  const topCompetitorPercentage = topCompetitor 
    ? ((topCompetitor.tweets + topCompetitor.mentions) / (totalTweets + totalMentions)) * 100 
    : 0;
  
  return (
    <div>
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-base font-medium">Competitor Activity</Title>
          {topCompetitor && (
            <Text className="mt-1">
              Top competitor: <span className="font-medium">{topCompetitor.competitor}</span>
              <Badge className="ml-2" color="blue">
                {topCompetitorPercentage.toFixed(1)}% of activity
              </Badge>
            </Text>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="h-3 w-3 rounded-full bg-blue-500 mr-1"></div>
            <Text className="text-sm">Tweets</Text>
          </div>
          <div className="flex items-center">
            <div className="h-3 w-3 rounded-full bg-indigo-500 mr-1"></div>
            <Text className="text-sm">Mentions</Text>
          </div>
        </div>
      </Flex>
      
      <div className="h-72">
        <BarChart
          className={className}
          data={sortedData}
          index="competitor"
          categories={["tweets", "mentions"]}
          colors={["blue", "indigo"]}
          valueFormatter={valueFormatter}
          stack={false}
          yAxisWidth={48}
          showLegend={false}
          showAnimation={true}
        />
      </div>
    </div>
  );
}
