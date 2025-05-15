import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { DashboardProvider, useDashboard } from '../context/DashboardContext.js';
import { api } from '../services/api.js';
import { socketService } from '../services/socket.js';

// Mock the API and socket service
jest.mock('../services/api.js', () => ({
  api: {
    getMetrics: jest.fn(),
    getTopicMetrics: jest.fn(),
    getConfig: jest.fn(),
    getTopicConfig: jest.fn(),
    getSystemStatus: jest.fn(),
    updateConfig: jest.fn(),
    updateTopicConfig: jest.fn(),
    resetCircuitBreakers: jest.fn(),
  },
  MetricsData: {},
  TopicMetricsData: {},
  ConfigData: {},
  TopicConfigData: {},
  SystemStatusData: {},
}));

jest.mock('../services/socket.js', () => ({
  socketService: {
    connect: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
}));

// Test component that uses the dashboard context
const TestComponent = () => {
  const { 
    metrics, 
    topicMetrics, 
    config, 
    topicConfig, 
    status, 
    metricsLoading, 
    configLoading, 
    statusLoading 
  } = useDashboard();

  return (
    <div>
      {metricsLoading && <div data-testid="metrics-loading">Loading metrics...</div>}
      {configLoading && <div data-testid="config-loading">Loading config...</div>}
      {statusLoading && <div data-testid="status-loading">Loading status...</div>}
      
      {metrics && <div data-testid="metrics-data">Metrics loaded</div>}
      {topicMetrics && <div data-testid="topic-metrics-data">Topic metrics loaded</div>}
      {config && <div data-testid="config-data">Config loaded</div>}
      {topicConfig && <div data-testid="topic-config-data">Topic config loaded</div>}
      {status && <div data-testid="status-data">Status loaded</div>}
    </div>
  );
};

describe('DashboardContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    api.getMetrics.mockResolvedValue({ timestamp: Date.now(), metrics: {}, enhancedMetrics: {} });
    api.getTopicMetrics.mockResolvedValue({ timestamp: Date.now(), topicMetrics: {} });
    api.getConfig.mockResolvedValue({ twitter: {}, telegram: {}, monitoring: {} });
    api.getTopicConfig.mockResolvedValue({});
    api.getSystemStatus.mockResolvedValue({ timestamp: Date.now(), status: 'online', services: { twitter: {}, telegram: {} } });
    api.updateConfig.mockResolvedValue({ twitter: {}, telegram: {}, monitoring: {} });
    api.updateTopicConfig.mockResolvedValue({});
    api.resetCircuitBreakers.mockResolvedValue({ success: true });
  });

  test('should show loading states initially', () => {
    render(
      <DashboardProvider>
        <TestComponent />
      </DashboardProvider>
    );

    expect(screen.getByTestId('metrics-loading')).toBeInTheDocument();
    expect(screen.getByTestId('config-loading')).toBeInTheDocument();
    expect(screen.getByTestId('status-loading')).toBeInTheDocument();
  });

  test('should load data from API on mount', async () => {
    render(
      <DashboardProvider>
        <TestComponent />
      </DashboardProvider>
    );

    // Verify API calls were made
    expect(api.getMetrics).toHaveBeenCalled();
    expect(api.getTopicMetrics).toHaveBeenCalled();
    expect(api.getConfig).toHaveBeenCalled();
    expect(api.getTopicConfig).toHaveBeenCalled();
    expect(api.getSystemStatus).toHaveBeenCalled();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByTestId('metrics-data')).toBeInTheDocument();
      expect(screen.getByTestId('topic-metrics-data')).toBeInTheDocument();
      expect(screen.getByTestId('config-data')).toBeInTheDocument();
      expect(screen.getByTestId('topic-config-data')).toBeInTheDocument();
      expect(screen.getByTestId('status-data')).toBeInTheDocument();
    });
  });

  test('should set up socket listeners on mount', () => {
    render(
      <DashboardProvider>
        <TestComponent />
      </DashboardProvider>
    );

    expect(socketService.connect).toHaveBeenCalled();
    expect(socketService.addListener).toHaveBeenCalledWith('metrics', expect.any(Function));
    expect(socketService.addListener).toHaveBeenCalledWith('topicMetrics', expect.any(Function));
    expect(socketService.addListener).toHaveBeenCalledWith('config', expect.any(Function));
    expect(socketService.addListener).toHaveBeenCalledWith('topicConfig', expect.any(Function));
    expect(socketService.addListener).toHaveBeenCalledWith('status', expect.any(Function));
  });

  test('should handle API errors gracefully', async () => {
    // Mock API error
    api.getMetrics.mockRejectedValue(new Error('Failed to fetch metrics'));
    
    render(
      <DashboardProvider>
        <TestComponent />
      </DashboardProvider>
    );
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByTestId('metrics-loading')).not.toBeInTheDocument();
    });
    
    // Metrics data should not be loaded due to error
    expect(screen.queryByTestId('metrics-data')).not.toBeInTheDocument();
    
    // But other data should still load
    await waitFor(() => {
      expect(screen.getByTestId('topic-metrics-data')).toBeInTheDocument();
      expect(screen.getByTestId('config-data')).toBeInTheDocument();
      expect(screen.getByTestId('topic-config-data')).toBeInTheDocument();
      expect(screen.getByTestId('status-data')).toBeInTheDocument();
    });
  });
});