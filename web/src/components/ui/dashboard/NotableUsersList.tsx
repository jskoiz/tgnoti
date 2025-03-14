"use client";

import { 
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

interface NotableUsersListProps {
  data: {
    userId: string;
    userName: string;
    name: string;
    profileImageUrl: string;
    verified: boolean;
    followers: number;
    tweets: number;
    totalEngagement: number;
    engagementPerTweet: number;
  }[];
  className?: string;
}

type SortField = 'followers' | 'tweets' | 'totalEngagement' | 'engagementPerTweet';
type SortDirection = 'asc' | 'desc';

export default function NotableUsersList({ data, className }: NotableUsersListProps) {
  const [sortField, setSortField] = useState<SortField>('followers');
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
        <Title className="text-base font-medium">Notable Users by Following Count</Title>
      </Flex>
      
      <Table className={className}>
        <TableHead>
          <TableRow>
            <TableHeaderCell>User</TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('followers')}
            >
              Followers {getSortIndicator('followers')}
            </TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('tweets')}
            >
              Tweets {getSortIndicator('tweets')}
            </TableHeaderCell>
            <TableHeaderCell 
              className="cursor-pointer"
              onClick={() => handleSort('engagementPerTweet')}
            >
              Engagement/Tweet {getSortIndicator('engagementPerTweet')}
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedData.map((user) => (
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
                  <div className="flex items-center gap-1">
                    <Text className="font-medium">{user.name}</Text>
                    {user.verified && (
                      <span className="text-blue-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                    <Text className="text-xs text-gray-500">@{user.userName}</Text>
                  </div>
                </Flex>
              </TableCell>
              <TableCell>
                <Text className="font-medium">{formatNumber(user.followers)}</Text>
              </TableCell>
              <TableCell>
                <Text>{formatNumber(user.tweets)}</Text>
              </TableCell>
              <TableCell>
                <Text>{Math.round(user.engagementPerTweet)}</Text>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
