"use client";

import { Badge, BarChart, Flex, Text, Title } from '@tremor/react';

interface TweetBarChartProps {
  data: any[];
  className?: string;
}

export default function TweetBarChart({ data, className }: TweetBarChartProps) {
  const valueFormatter = (value: number) => `${value} tweets`;
  
  // Sort data by count in descending order
  const sortedData = [...data].sort((a, b) => b.count - a.count);
  
  // Get top topic
  const topTopic = sortedData.length > 0 ? sortedData[0] : null;
  
  // Calculate total tweets
  const totalTweets = data.reduce((acc, item) => acc + item.count, 0);
  
  // Calculate percentage for top topic
  const topTopicPercentage = topTopic && totalTweets > 0 
    ? (topTopic.count / totalTweets) * 100 
    : 0;
  
  return (
    <div>
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-base font-medium">Topic Distribution</Title>
          {topTopic && (
            <Text className="mt-1">
              Top topic: <span className="font-medium">{topTopic.topic}</span>
              <Badge className="ml-2" color="blue">
                {topTopicPercentage.toFixed(1)}% of tweets
              </Badge>
            </Text>
          )}
        </div>
      </Flex>
      
      <div className="h-72 mt-4">
        <BarChart
          className={className}
          data={sortedData.slice(0, 8)} // Show only top 8 topics for better visibility
          index="topic"
          categories={["count"]}
          colors={["blue"]}
          valueFormatter={valueFormatter}
          showLegend={false}
          showAnimation={true}
          yAxisWidth={48}
        />
      </div>
    </div>
  );
}
