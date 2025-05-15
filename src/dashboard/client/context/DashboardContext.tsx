import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { 
  MetricsData, 
  TopicMetricsData, 
  ConfigData, 
  TopicConfigData, 
  SystemStatusData 
} from '../services/api.js';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';

// Define the context state interface
interface DashboardContextState {
  // Metrics state
  metrics: MetricsData | null;
  topicMetrics: TopicMetricsData | null;
  metricsLoading: boolean;
  metricsError: Error | null;
  
  // Config state
  config: ConfigData | null;
  topicConfig: TopicConfigData | null;
  configLoading: boolean;
  configError: Error | null;
  configSaving: boolean;
  
  // Status state
  status: SystemStatusData | null;
  statusLoading: boolean;
  statusError: Error | null;
  circuitBreakerResetting: boolean;
  
  // Actions
  refreshMetrics: () => Promise<void>;
  refreshConfig: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  updateConfig: (newConfig: Partial<ConfigData>) => Promise<ConfigData>;
  updateTopicConfig: (newTopicConfig: Partial<TopicConfigData>) => Promise<TopicConfigData>;
  resetCircuitBreakers: () => Promise<{ success: boolean; error?: string }>;
}

// Create the context with a default undefined value
const DashboardContext = createContext<DashboardContextState | undefined>(undefined);

// Provider props interface
interface DashboardProviderProps {
  children: ReactNode;
}

// Provider component
export const DashboardProvider: React.FC<DashboardProviderProps> = ({ children }) => {
  // Metrics state
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [topicMetrics, setTopicMetrics] = useState<TopicMetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(true);
  const [metricsError, setMetricsError] = useState<Error | null>(null);
  
  // Config state
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [topicConfig, setTopicConfig] = useState<TopicConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState<boolean>(true);
  const [configError, setConfigError] = useState<Error | null>(null);
  const [configSaving, setConfigSaving] = useState<boolean>(false);
  
  // Status state
  const [status, setStatus] = useState<SystemStatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<Error | null>(null);
  const [circuitBreakerResetting, setCircuitBreakerResetting] = useState<boolean>(false);

  // Initialize data and set up WebSocket listeners
  useEffect(() => {
    let isMounted = true;

    // Fetch all initial data
    const fetchInitialData = async () => {
      try {
        // Fetch metrics
        setMetricsLoading(true);
        const [metricsData, topicMetricsData] = await Promise.all([
          api.getMetrics(),
          api.getTopicMetrics()
        ]);
        
        if (isMounted) {
          setMetrics(metricsData);
          setTopicMetrics(topicMetricsData);
          setMetricsError(null);
        }
      } catch (err) {
        if (isMounted) {
          setMetricsError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setMetricsLoading(false);
        }
      }

      try {
        // Fetch config
        setConfigLoading(true);
        const [configData, topicConfigData] = await Promise.all([
          api.getConfig(),
          api.getTopicConfig()
        ]);
        
        if (isMounted) {
          setConfig(configData);
          setTopicConfig(topicConfigData);
          setConfigError(null);
        }
      } catch (err) {
        if (isMounted) {
          setConfigError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setConfigLoading(false);
        }
      }

      try {
        // Fetch status
        setStatusLoading(true);
        const statusData = await api.getSystemStatus();
        
        if (isMounted) {
          setStatus(statusData);
          setStatusError(null);
        }
      } catch (err) {
        if (isMounted) {
          setStatusError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setStatusLoading(false);
        }
      }
    };

    // Fetch initial data
    fetchInitialData();

    // Set up WebSocket connection and listeners
    socketService.connect();
    
    // Metrics listeners
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
    
    // Config listeners
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
    
    // Status listener
    const statusListener = (data: SystemStatusData) => {
      if (isMounted) {
        setStatus(data);
      }
    };
    
    // Add all listeners
    socketService.addListener<MetricsData>('metrics', metricsListener);
    socketService.addListener<TopicMetricsData>('topicMetrics', topicMetricsListener);
    socketService.addListener<ConfigData>('config', configListener);
    socketService.addListener<TopicConfigData>('topicConfig', topicConfigListener);
    socketService.addListener<SystemStatusData>('status', statusListener);

    // Clean up
    return () => {
      isMounted = false;
      socketService.removeListener('metrics', metricsListener);
      socketService.removeListener('topicMetrics', topicMetricsListener);
      socketService.removeListener('config', configListener);
      socketService.removeListener('topicConfig', topicConfigListener);
      socketService.removeListener('status', statusListener);
    };
  }, []);

  // Action: Refresh metrics
  const refreshMetrics = async () => {
    try {
      setMetricsLoading(true);
      const [metricsData, topicMetricsData] = await Promise.all([
        api.getMetrics(),
        api.getTopicMetrics()
      ]);
      
      setMetrics(metricsData);
      setTopicMetrics(topicMetricsData);
      setMetricsError(null);
    } catch (err) {
      setMetricsError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setMetricsLoading(false);
    }
  };

  // Action: Refresh config
  const refreshConfig = async () => {
    try {
      setConfigLoading(true);
      const [configData, topicConfigData] = await Promise.all([
        api.getConfig(),
        api.getTopicConfig()
      ]);
      
      setConfig(configData);
      setTopicConfig(topicConfigData);
      setConfigError(null);
    } catch (err) {
      setConfigError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setConfigLoading(false);
    }
  };

  // Action: Refresh status
  const refreshStatus = async () => {
    try {
      setStatusLoading(true);
      const statusData = await api.getSystemStatus();
      
      setStatus(statusData);
      setStatusError(null);
    } catch (err) {
      setStatusError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setStatusLoading(false);
    }
  };

  // Action: Update config
  const updateConfig = async (newConfig: Partial<ConfigData>) => {
    try {
      setConfigSaving(true);
      const updatedConfig = await api.updateConfig(newConfig);
      setConfig(updatedConfig);
      setConfigError(null);
      return updatedConfig;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setConfigError(error);
      throw error;
    } finally {
      setConfigSaving(false);
    }
  };

  // Action: Update topic config
  const updateTopicConfig = async (newTopicConfig: Partial<TopicConfigData>) => {
    try {
      setConfigSaving(true);
      const updatedTopicConfig = await api.updateTopicConfig(newTopicConfig);
      setTopicConfig(updatedTopicConfig);
      setConfigError(null);
      return updatedTopicConfig;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setConfigError(error);
      throw error;
    } finally {
      setConfigSaving(false);
    }
  };

  // Action: Reset circuit breakers
  const resetCircuitBreakers = async () => {
    try {
      setCircuitBreakerResetting(true);
      const result = await api.resetCircuitBreakers();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to reset circuit breakers');
      }
      
      // Refresh status after reset
      await refreshStatus();
      
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setStatusError(error);
      throw error;
    } finally {
      setCircuitBreakerResetting(false);
    }
  };

  // Create the context value object
  const contextValue: DashboardContextState = {
    // Metrics state
    metrics,
    topicMetrics,
    metricsLoading,
    metricsError,
    
    // Config state
    config,
    topicConfig,
    configLoading,
    configError,
    configSaving,
    
    // Status state
    status,
    statusLoading,
    statusError,
    circuitBreakerResetting,
    
    // Actions
    refreshMetrics,
    refreshConfig,
    refreshStatus,
    updateConfig,
    updateTopicConfig,
    resetCircuitBreakers
  };

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
};

// Custom hook to use the dashboard context
export const useDashboard = () => {
  const context = useContext(DashboardContext);
  
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  
  return context;
};