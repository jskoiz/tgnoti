import { useState, useEffect } from 'react';
import { api, ConfigData, TopicConfigData } from '../services/api.js';
import { socketService } from '../services/socket.js';

/**
 * Hook for fetching and managing configuration data
 */
export function useConfig() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [topicConfig, setTopicConfig] = useState<TopicConfigData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch configuration data
        const [configData, topicConfigData] = await Promise.all([
          api.getConfig(),
          api.getTopicConfig()
        ]);
        
        if (isMounted) {
          setConfig(configData);
          setTopicConfig(topicConfigData);
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
    
    const configListener = (data: ConfigData) => {
      if (isMounted) {
        setConfig(data);
      }
    };
    
    const topicConfigListener = (data: TopicConfigData) => {
      if (isMounted) {
        setTopicConfig(data);
      }
    };
    
    socketService.addListener<ConfigData>('config', configListener);
    socketService.addListener<TopicConfigData>('topicConfig', topicConfigListener);

    // Clean up
    return () => {
      isMounted = false;
      socketService.removeListener('config', configListener);
      socketService.removeListener('topicConfig', topicConfigListener);
    };
  }, []);

  /**
   * Update configuration
   */
  const updateConfig = async (newConfig: Partial<ConfigData>) => {
    try {
      setSaving(true);
      const updatedConfig = await api.updateConfig(newConfig);
      setConfig(updatedConfig);
      setError(null);
      return updatedConfig;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Update topic configuration
   */
  const updateTopicConfig = async (newTopicConfig: Partial<TopicConfigData>) => {
    try {
      setSaving(true);
      const updatedTopicConfig = await api.updateTopicConfig(newTopicConfig);
      setTopicConfig(updatedTopicConfig);
      setError(null);
      return updatedTopicConfig;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  return {
    config,
    topicConfig,
    loading,
    error,
    saving,
    updateConfig,
    updateTopicConfig,
    refresh: async () => {
      try {
        const [configData, topicConfigData] = await Promise.all([
          api.getConfig(),
          api.getTopicConfig()
        ]);
        
        setConfig(configData);
        setTopicConfig(topicConfigData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    }
  };
}