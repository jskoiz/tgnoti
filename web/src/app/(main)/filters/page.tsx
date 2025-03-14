'use client';

import { useState, useEffect } from 'react';
import { Card, Title, Text, Button, Select, SelectItem, TextInput, Grid } from '@tremor/react';
import { Topic } from '@/types/topic';
import { TopicFilterDocument } from '@/types/filter';

export default function FiltersPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [filters, setFilters] = useState<TopicFilterDocument[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [newFilterType, setNewFilterType] = useState<string>('');
  const [newFilterValue, setNewFilterValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch topics on component mount
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const res = await fetch('/api/topics');
        const data = await res.json();
        
        if (data.success) {
          setTopics(data.data);
          if (data.data.length > 0) {
            setSelectedTopicId(data.data[0].id.toString());
          }
        } else {
          setError('Failed to fetch topics');
        }
      } catch (error) {
        setError('An error occurred while fetching topics');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTopics();
  }, []);

  // Fetch filters when selected topic changes
  useEffect(() => {
    if (selectedTopicId) {
      fetchFilters(selectedTopicId);
    }
  }, [selectedTopicId]);

  const fetchFilters = async (topicId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/filters/${topicId}`);
      const data = await res.json();
      
      if (data.success) {
        setFilters(data.data);
      } else {
        setError('Failed to fetch filters');
      }
    } catch (error) {
      setError('An error occurred while fetching filters');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFilter = async () => {
    if (!selectedTopicId || !newFilterType || !newFilterValue) {
      setError('Please fill in all fields');
      return;
    }
    
    try {
      const res = await fetch(`/api/filters/${selectedTopicId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: newFilterType,
          value: newFilterValue,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Refresh filters
        fetchFilters(selectedTopicId);
        // Clear form
        setNewFilterType('');
        setNewFilterValue('');
        setError(null);
      } else {
        setError(data.error || 'Failed to add filter');
      }
    } catch (error) {
      setError('An error occurred while adding the filter');
      console.error(error);
    }
  };

  const handleDeleteFilter = async (filter: TopicFilterDocument) => {
    try {
      const res = await fetch(`/api/filters/${selectedTopicId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: filter.type,
          value: filter.value,
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Refresh filters
        fetchFilters(selectedTopicId);
        setError(null);
      } else {
        setError(data.error || 'Failed to delete filter');
      }
    } catch (error) {
      setError('An error occurred while deleting the filter');
      console.error(error);
    }
  };

  if (isLoading && topics.length === 0) {
    return (
      <div className="p-4">
        <Text>Loading...</Text>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <Title>Filter Management</Title>
        <Text>View and manage filters for topics</Text>
      </div>
      
      {error && (
        <Card className="mb-6 bg-red-50 border-red-200">
          <Text className="text-red-700">{error}</Text>
        </Card>
      )}
      
      <Card className="mb-6">
        <div className="mb-4">
          <Text className="mb-2">Select Topic</Text>
          <Select
            value={selectedTopicId}
            onValueChange={setSelectedTopicId}
            placeholder="Select a topic"
          >
            {topics.map((topic) => (
              <SelectItem key={topic.id} value={topic.id.toString()}>
                {topic.name}
              </SelectItem>
            ))}
          </Select>
        </div>
        
        <div className="mb-4">
          <Title className="text-lg mb-2">Add New Filter</Title>
          <Grid numItems={1} numItemsSm={2} numItemsLg={5} className="gap-2">
            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <Select
                value={newFilterType}
                onValueChange={setNewFilterType}
                placeholder="Filter Type"
              >
                <SelectItem value="include">Include</SelectItem>
                <SelectItem value="exclude">Exclude</SelectItem>
                <SelectItem value="username">Username</SelectItem>
                <SelectItem value="keyword">Keyword</SelectItem>
                <SelectItem value="hashtag">Hashtag</SelectItem>
              </Select>
            </div>
            <div className="col-span-1 sm:col-span-1 lg:col-span-2">
              <TextInput
                placeholder="Filter Value"
                value={newFilterValue}
                onChange={(e) => setNewFilterValue(e.target.value)}
              />
            </div>
            <div>
              <Button onClick={handleAddFilter} className="w-full">
                Add Filter
              </Button>
            </div>
          </Grid>
        </div>
      </Card>
      
      <Card>
        <Title className="text-lg mb-4">Current Filters</Title>
        {isLoading ? (
          <Text>Loading filters...</Text>
        ) : filters.length === 0 ? (
          <Text>No filters found for this topic.</Text>
        ) : (
          <div className="space-y-4">
            {filters.map((filter, index) => (
              <div key={index} className="flex justify-between items-center p-3 border-b">
                <div>
                  <Text className="font-medium">{filter.type}</Text>
                  <Text>{filter.value}</Text>
                </div>
                <Button
                  variant="secondary"
                  color="red"
                  onClick={() => handleDeleteFilter(filter)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
