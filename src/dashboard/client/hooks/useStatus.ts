import { useState, useEffect } from 'react';
import { api, SystemStatusData } from '../services/api.js';
import { socketService } from '../services/socket.js';

/**
 * Hook for fetching and subscribing to system status data
 */
export function useStatus() {
  const [status, setStatus] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [resetting, setResetting] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch status data
        const statusData = await api.getSystemStatus();
        
        if (isMounted) {
          setStatus(statusData);
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
    
    const statusListener = (data: SystemStatusData) => {
      if (isMounted) {
        setStatus(data);
      }
    };
    
    socketService.addListener<SystemStatusData>('status', statusListener);

    // Clean up
    return () => {
      isMounted = false;
      socketService.removeListener('status', statusListener);
    };
  }, []);

  /**
   * Reset circuit breakers
   */
  const resetCircuitBreakers = async () => {
    try {
      setResetting(true);
      const result = await api.resetCircuitBreakers();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to reset circuit breakers');
      }
      
      // Refresh status
      const statusData = await api.getSystemStatus();
      setStatus(statusData);
      setError(null);
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setResetting(false);
    }
  };

  return {
    status,
    loading,
    error,
    resetting,
    resetCircuitBreakers,
    refresh: async () => {
      try {
        const statusData = await api.getSystemStatus();
        setStatus(statusData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };
}