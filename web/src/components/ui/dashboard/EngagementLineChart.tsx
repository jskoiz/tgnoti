"use client";

import { Badge, Flex, LineChart, Text, Title } from '@tremor/react';

interface EngagementLineChartProps {
  data: {
    date: string;
    retweets: number;
    likes: number;
    replies: number;
  }[];
  className?: string;
}

export default function EngagementLineChart({ data, className }: EngagementLineChartProps) {
  const valueFormatter = (value: number) => `${value.toLocaleString()}`;
  
  // Calculate totals and trends
  const totalRetweets = data.reduce((acc, item) => acc + item.retweets, 0);
  const totalLikes = data.reduce((acc, item) => acc + item.likes, 0);
  const totalReplies = data.reduce((acc, item) => acc + item.replies, 0);
  
  // Calculate percentage change if we have enough data points
  let retweetTrend = 0;
  let likesTrend = 0;
  let repliesTrend = 0;
  
  if (data.length >= 2) {
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstHalfRetweets = firstHalf.reduce((acc, item) => acc + item.retweets, 0);
    const secondHalfRetweets = secondHalf.reduce((acc, item) => acc + item.retweets, 0);
    
    const firstHalfLikes = firstHalf.reduce((acc, item) => acc + item.likes, 0);
    const secondHalfLikes = secondHalf.reduce((acc, item) => acc + item.likes, 0);
    
    const firstHalfReplies = firstHalf.reduce((acc, item) => acc + item.replies, 0);
    const secondHalfReplies = secondHalf.reduce((acc, item) => acc + item.replies, 0);
    
    if (firstHalfRetweets > 0) {
      retweetTrend = ((secondHalfRetweets - firstHalfRetweets) / firstHalfRetweets) * 100;
    }
    
    if (firstHalfLikes > 0) {
      likesTrend = ((secondHalfLikes - firstHalfLikes) / firstHalfLikes) * 100;
    }
    
    if (firstHalfReplies > 0) {
      repliesTrend = ((secondHalfReplies - firstHalfReplies) / firstHalfReplies) * 100;
    }
  }
  
  // Get badge color based on trend
  const getBadgeColor = (trend: number) => {
    if (trend > 10) return "green";
    if (trend > 0) return "blue";
    if (trend < -10) return "red";
    if (trend < 0) return "orange";
    return "gray";
  };
  
  return (
    <div>
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-base font-medium">Engagement Over Time</Title>
          <Text className="mt-1">
            Tracking retweets, likes, and replies
          </Text>
        </div>
      </Flex>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="flex flex-col">
          <Text className="text-sm text-gray-500">Retweets</Text>
          <div className="flex items-center gap-2">
            <Text className="text-xl font-medium">{totalRetweets.toLocaleString()}</Text>
            {Math.abs(retweetTrend) > 0 && (
              <Badge color={getBadgeColor(retweetTrend)}>
                {retweetTrend > 0 ? "+" : ""}{retweetTrend.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <Text className="text-sm text-gray-500">Likes</Text>
          <div className="flex items-center gap-2">
            <Text className="text-xl font-medium">{totalLikes.toLocaleString()}</Text>
            {Math.abs(likesTrend) > 0 && (
              <Badge color={getBadgeColor(likesTrend)}>
                {likesTrend > 0 ? "+" : ""}{likesTrend.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <Text className="text-sm text-gray-500">Replies</Text>
          <div className="flex items-center gap-2">
            <Text className="text-xl font-medium">{totalReplies.toLocaleString()}</Text>
            {Math.abs(repliesTrend) > 0 && (
              <Badge color={getBadgeColor(repliesTrend)}>
                {repliesTrend > 0 ? "+" : ""}{repliesTrend.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
      </div>
      
      <div className="h-72">
        <LineChart
          className={className}
          data={data}
          index="date"
          categories={["retweets", "likes", "replies"]}
          colors={["cyan", "orange", "emerald"]}
          valueFormatter={valueFormatter}
          showLegend={true}
          showAnimation={true}
          curveType="monotone"
          showGridLines={false}
          showYAxis={true}
          autoMinValue={true}
        />
      </div>
    </div>
  );
}
