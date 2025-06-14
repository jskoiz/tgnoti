/**
 * API service for communicating with the dashboard server
 */

export interface MetricsData {
  timestamp: number;
  metrics: Record<string, number>;
  enhancedMetrics: Record<string, number>;
}

export interface TopicMetricsData {
  timestamp: number;
  topicMetrics: Record<string, Record<string, number>>;
}

export interface ConfigData {
  twitter: {
    enabled: boolean;
    searchInterval: number;
    maxResults: number;
  };
  telegram: {
    enabled: boolean;
    chatId: string;
    sendInterval: number;
  };
  monitoring: {
    metricsInterval: number;
  };
}

export interface TopicConfigData {
  [key: string]: {
    id: number;
    notification: { enabled: boolean };
    filters: Array<{
      type: string;
      value: string;
    }>;
  };
}

export interface SystemStatusData {
  timestamp: number;
  status: string;
  services: {
    twitter: {
      status: string;
      circuitBreaker: string;
    };
    telegram: {
      status: string;
      circuitBreaker: string;
    };
  };
}

/**
 * API service for communicating with the dashboard server
 */
export const api = {
  /**
   * Get current metrics
   */
  getMetrics: async (): Promise<MetricsData> => {
    try {
      const response = await fetch('/api/metrics');

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch metrics: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get metrics by topic
   */
  getTopicMetrics: async (): Promise<TopicMetricsData> => {
    try {
      const response = await fetch('/api/metrics/topics');

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch topic metrics: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get current configuration
   */
  getConfig: async (): Promise<ConfigData> => {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error(`Failed to fetch configuration: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Update configuration
   */
  updateConfig: async (config: Partial<ConfigData>): Promise<ConfigData> => {
    const response = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`Failed to update configuration: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get topic configuration
   */
  getTopicConfig: async (): Promise<TopicConfigData> => {
    const response = await fetch('/api/config/topics');
    if (!response.ok) {
      throw new Error(`Failed to fetch topic configuration: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Update topic configuration
   */
  updateTopicConfig: async (topicConfig: Partial<TopicConfigData>): Promise<TopicConfigData> => {
    const response = await fetch('/api/config/topics', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(topicConfig),
    });
    if (!response.ok) {
      throw new Error(`Failed to update topic configuration: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Reset circuit breakers
   */
  resetCircuitBreakers: async (): Promise<{ success: boolean; error?: string }> => {
    const response = await fetch('/api/control/reset-circuit-breakers', {
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`Failed to reset circuit breakers: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get system status
   */
  getSystemStatus: async (): Promise<SystemStatusData> => {
    const response = await fetch('/api/control/status');
    if (!response.ok) {
      throw new Error(`Failed to fetch system status: ${response.statusText}`);
    }
    return response.json();
  },
};
