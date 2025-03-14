"use client";

import { AreaChart, Badge, Flex, Text, Title } from '@tremor/react';

interface TweetAreaChartProps {
  data: any[];
  className?: string;
}

export default function TweetAreaChart({ data, className }: TweetAreaChartProps) {
  const valueFormatter = (value: number) => `${value} tweets`;
  
  // Calculate totals and trends
  const totalSent = data.reduce((acc, item) => acc + (item.sent || 0), 0);
  const totalRejected = data.reduce((acc, item) => acc + (item.rejected || 0), 0);
  const totalTweets = totalSent + totalRejected;
  
  // Calculate percentage change if we have enough data points
  let sentTrend = 0;
  if (data.length >= 2) {
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstHalfSent = firstHalf.reduce((acc, item) => acc + (item.sent || 0), 0);
    const secondHalfSent = secondHalf.reduce((acc, item) => acc + (item.sent || 0), 0);
    
    if (firstHalfSent > 0) {
      sentTrend = ((secondHalfSent - firstHalfSent) / firstHalfSent) * 100;
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
    <div className={className}>
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-base font-medium">Tweet Volume Trends</Title>
          <Text className="mt-1">
            Delivery rate: <span className="font-medium">{totalTweets > 0 ? ((totalSent / totalTweets) * 100).toFixed(1) : 0}%</span>
            {Math.abs(sentTrend) > 0 && (
              <Badge className="ml-2" color={getBadgeColor(sentTrend)}>
                {sentTrend > 0 ? "+" : ""}{sentTrend.toFixed(1)}% trend
              </Badge>
            )}
          </Text>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="h-3 w-3 rounded-full bg-blue-500 mr-1"></div>
            <Text className="text-sm">Sent</Text>
          </div>
          <div className="flex items-center">
            <div className="h-3 w-3 rounded-full bg-red-500 mr-1"></div>
            <Text className="text-sm">Rejected</Text>
          </div>
        </div>
      </Flex>
      
      <div className="h-72 mt-4">
        <AreaChart
          className="h-full"
          data={data}
          index="date"
          categories={["sent", "rejected"]}
          colors={["blue", "red"]}
          valueFormatter={valueFormatter}
          showLegend={false}
          showAnimation={true}
          curveType="monotone"
          showGridLines={false}
          showYAxis={true}
          autoMinValue={true}
          minValue={0}
          enableLegendSlider={false}
          yAxisWidth={40}
        />
      </div>
    </div>
  );
}
