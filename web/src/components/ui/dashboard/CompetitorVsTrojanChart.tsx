"use client";

import { Badge, BarChart, Flex, Text, Title } from '@tremor/react';

interface CompetitorVsTrojanChartProps {
  data: {
    date: string;
    Trojan: number;
    Competitors: number;
  }[];
  className?: string;
}

export default function CompetitorVsTrojanChart({ data, className }: CompetitorVsTrojanChartProps) {
  const valueFormatter = (value: number) => `${value}`;
  
  // Calculate totals for comparison
  const totalTrojan = data.reduce((acc, item) => acc + item.Trojan, 0);
  const totalCompetitors = data.reduce((acc, item) => acc + item.Competitors, 0);
  const totalMentions = totalTrojan + totalCompetitors;
  
  // Calculate percentage of total mentions for Trojan
  const trojanPercentage = totalMentions > 0 
    ? (totalTrojan / totalMentions) * 100 
    : 0;
  
  // Calculate trend (comparing first half to second half of the period)
  let trojanTrend = 0;
  if (data.length >= 2) {
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstHalfTrojan = firstHalf.reduce((acc, item) => acc + item.Trojan, 0);
    const secondHalfTrojan = secondHalf.reduce((acc, item) => acc + item.Trojan, 0);
    
    if (firstHalfTrojan > 0) {
      trojanTrend = ((secondHalfTrojan - firstHalfTrojan) / firstHalfTrojan) * 100;
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
          <Title className="text-base font-medium">Competitor vs. Trojan Mentions</Title>
          <Text className="mt-1">
            Trojan share: <span className="font-medium">{trojanPercentage.toFixed(1)}%</span>
            {Math.abs(trojanTrend) > 0 && (
              <Badge className="ml-2" color={getBadgeColor(trojanTrend)}>
                {trojanTrend > 0 ? "+" : ""}{trojanTrend.toFixed(1)}% trend
              </Badge>
            )}
          </Text>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <div className="h-3 w-3 rounded-full bg-indigo-500 mr-1"></div>
            <Text className="text-sm">Trojan</Text>
          </div>
          <div className="flex items-center">
            <div className="h-3 w-3 rounded-full bg-emerald-500 mr-1"></div>
            <Text className="text-sm">Competitors</Text>
          </div>
        </div>
      </Flex>
      
      <div className="h-72">
        <BarChart
          className={className}
          data={data}
          index="date"
          categories={["Trojan", "Competitors"]}
          colors={["indigo", "emerald"]}
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
