import { useState, useEffect } from 'react';
import { api, MetricsData, TopicMetricsData } from '../services/api.js';
import { socketService } from '../services/socket.js';

/**
 * Hook for fetching and subscribing to metrics data
 */
export function useMetrics() {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [topicMetrics, setTopicMetrics] = useState<TopicMetricsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch metrics data
        const [metricsData, topicMetricsData] = await Promise.all([
          api.getMetrics(),
          api.getTopicMetrics()
        ]);
        
        if (isMounted) {
          setMetrics(metricsData);
          setTopicMetrics(topicMetricsData);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Fetch initial data
    fetchData();

    // Subscribe to real-time updates
    socketService.connect();
    
    const metricsListener = (data: MetricsData) => {
      if (isMounted) {
        setMetrics(data);
      }
    };
    
    const topicMetricsListener = (data: TopicMetricsData) => {
      if (isMounted) {
        setTopicMetrics(data);
      }
    };
    
    socketService.addListener<MetricsData>('metrics', metricsListener);
    socketService.addListener<TopicMetricsData>('topicMetrics', topicMetricsListener);

    // Clean up
    return () => {
      isMounted = false;
      socketService.removeListener('metrics', metricsListener);
      socketService.removeListener('topicMetrics', topicMetricsListener);
    };
  }, []);

  return {
    metrics,
    topicMetrics,
    loading,
    error,
    refresh: async () => {
      try {
        const [metricsData, topicMetricsData] = await Promise.all([
          api.getMetrics(),
          api.getTopicMetrics()
        ]);
        
        setMetrics(metricsData);
        setTopicMetrics(topicMetricsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };
}