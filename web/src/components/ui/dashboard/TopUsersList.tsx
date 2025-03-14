"use client";

import { 
  Badge, 
  Flex, 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeaderCell, 
  TableRow, 
  Text, 
  Title 
} from '@tremor/react';
import { useState } from 'react';

interface TopUsersListProps {
  data: {
    userId: string;
    userName: string;
    name: string;
    profileImageUrl: string;
    tweets: number;
    likes: number;
    retweets: number;
    replies: number;
    totalEngagement: number;
  }[];
  className?: string;
}

type SortField = 'tweets' | 'likes' | 'retweets' | 'replies' | 'totalEngagement';
type SortDirection = 'asc' | 'desc';

export default function TopUsersList({ data, className }: TopUsersListProps) {
  const [sortField, setSortField] = useState<SortField>('tweets');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Handle sort click
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // New field, default to descending
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  // Sort the data
  const sortedData = [...data].sort((a, b) => {
    const multiplier = sortDirection === 'desc' ? -1 : 1;
    return (a[sortField] - b[sortField]) * multiplier;
  });
  
  // Format large numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  };
  
  // Get sort indicator
  const getSortIndicator = (field: SortField) => {
    if (field !== sortField) return null;
    return sortDirection === 'desc' ? '↓' : '↑';
  };
  
  return (
    <div>
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <Title className="text-base font-medium">Top Users by Tweet Volume</Title>
      </Flex>
      
      <Table className={className}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>User</TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('tweets')}
            >
              Tweets {getSortIndicator('tweets')}
            </TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('likes')}
            >
              Likes {getSortIndicator('likes')}
            </TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('retweets')}
            >
              Retweets {getSortIndicator('retweets')}
            </TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('totalEngagement')}
            >
              Total Engagement {getSortIndicator('totalEngagement')}
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedData.map((user, index) => (
            <TableRow key={user.userId}>
              <TableCell>
                <Flex alignItems="center" className="gap-2">
                  <div className="w-8 h-8 rounded-full overflow-hidden">
                    <img 
                      src={user.profileImageUrl} 
                      alt={user.name} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fallback for broken images
                        (e.target as HTMLImageElement).src = 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png';
                      }}
                    />
                  </div>
                  <div>
                    <Text className="font-medium">{user.name}</Text>
                    <Text className="text-xs text-gray-500">@{user.userName}</Text>
                  </div>
                  {index < 3 && (
                    <Badge color={index === 0 ? "amber" : index === 1 ? "blue" : "gray"} size="xs">
                      #{index + 1}
                    </Badge>
                  )}
                </Flex>
              </TableCell>
              <TableCell>
                <Text>{formatNumber(user.tweets)}</Text>
              </TableCell>
              <TableCell>
                <Text>{formatNumber(user.likes)}</Text>
              </TableCell>
              <TableCell>
                <Text>{formatNumber(user.retweets)}</Text>
              </TableCell>
              <TableCell>
                <Text className="font-medium">{formatNumber(user.totalEngagement)}</Text>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
