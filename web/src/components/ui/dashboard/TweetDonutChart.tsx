"use client";

import { Badge, DonutChart, Flex, List, ListItem, Text, Title } from '@tremor/react';

interface TweetDonutChartProps {
  data: any[];
  className?: string;
}

export default function TweetDonutChart({ data, className }: TweetDonutChartProps) {
  const valueFormatter = (value: number) => `${value} tweets`;
  
  // Sort data by count in descending order
  const sortedData = [...data].sort((a, b) => b.count - a.count);
  
  // Get top rejection reason
  const topReason = sortedData.length > 0 ? sortedData[0] : null;
  
  // Calculate total rejections
  const totalRejections = data.reduce((acc, item) => acc + item.count, 0);
  
  // Calculate percentage for top reason
  const topReasonPercentage = topReason && totalRejections > 0 
    ? (topReason.count / totalRejections) * 100 
    : 0;
  
  // Format reason names to be more readable
  const formatReason = (reason: string) => {
    if (!reason) return "Unknown";
    
    // Convert snake_case to Title Case with spaces
    return reason
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };
  
  // Apply formatting to the data
  const formattedData = sortedData.map(item => ({
    ...item,
    reason: formatReason(item.reason)
  }));
  
  return (
    <div>
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-base font-medium">Rejection Analysis</Title>
          {topReason && (
            <Text className="mt-1">
              Main reason: <span className="font-medium">{formatReason(topReason.reason)}</span>
              <Badge className="ml-2" color="red">
                {topReasonPercentage.toFixed(1)}% of rejections
              </Badge>
            </Text>
          )}
        </div>
      </Flex>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-72">
          <DonutChart
            className={className}
            data={formattedData}
            category="count"
            index="reason"
            valueFormatter={valueFormatter}
            colors={["blue", "cyan", "indigo", "violet", "fuchsia", "pink", "rose", "orange"]}
            showAnimation={true}
            showTooltip={true}
          />
        </div>
        
        <div className="flex items-center">
          <List>
            {formattedData.slice(0, 5).map((item) => (
              <ListItem key={item.reason}>
                <div className="flex justify-between items-center w-full">
                  <Text>{item.reason}</Text>
                  <div className="flex items-center gap-2">
                    <Text>{item.count} tweets</Text>
                    <Text color="gray">
                      ({((item.count / totalRejections) * 100).toFixed(1)}%)
                    </Text>
                  </div>
                </div>
              </ListItem>
            ))}
          </List>
        </div>
      </div>
    </div>
  );
}
