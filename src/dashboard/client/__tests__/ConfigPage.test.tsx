import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConfigPage from '../components/config/ConfigPage.js';
import { DashboardProvider } from '../context/DashboardContext.js';
import { api } from '../services/api.js';

// Mock the API
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

// Mock the socket service
jest.mock('../services/socket.js', () => ({
  socketService: {
    connect: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
  },
}));

describe('ConfigPage', () => {
  const mockConfig = {
    twitter: {
      enabled: true,
      searchInterval: 60000,
      maxResults: 50,
    },
    telegram: {
      enabled: true,
      chatId: 'test-chat-id',
      sendInterval: 30000,
    },
    monitoring: {
      metricsInterval: 15000,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock successful API responses
    api.getMetrics.mockResolvedValue({ timestamp: Date.now(), metrics: {}, enhancedMetrics: {} });
    api.getTopicMetrics.mockResolvedValue({ timestamp: Date.now(), topicMetrics: {} });
    api.getConfig.mockResolvedValue(mockConfig);
    api.getTopicConfig.mockResolvedValue({});
    api.getSystemStatus.mockResolvedValue({ timestamp: Date.now(), status: 'online', services: { twitter: {}, telegram: {} } });
    api.updateConfig.mockResolvedValue(mockConfig);
  });

  test('renders configuration form with data from context', async () => {
    render(
      <DashboardProvider>
        <ConfigPage />
      </DashboardProvider>
    );

    // Wait for the config to load
    await waitFor(() => {
      expect(screen.getByText('System Configuration')).toBeInTheDocument();
    });

    // Check that form fields are populated with the mock data
    expect(screen.getByLabelText(/Enable Twitter Service/i)).toBeChecked();
    expect(screen.getByLabelText(/Search Interval/i)).toHaveValue(60000);
    expect(screen.getByLabelText(/Max Results/i)).toHaveValue(50);
    expect(screen.getByLabelText(/Enable Telegram Service/i)).toBeChecked();
    expect(screen.getByLabelText(/Chat ID/i)).toHaveValue('test-chat-id');
    expect(screen.getByLabelText(/Send Interval/i)).toHaveValue(30000);
    expect(screen.getByLabelText(/Metrics Interval/i)).toHaveValue(15000);
  });

  test('submits form with updated values', async () => {
    render(
      <DashboardProvider>
        <ConfigPage />
      </DashboardProvider>
    );

    // Wait for the config to load
    await waitFor(() => {
      expect(screen.getByText('System Configuration')).toBeInTheDocument();
    });

    // Update form values
    fireEvent.click(screen.getByLabelText(/Enable Twitter Service/i)); // Uncheck
    fireEvent.change(screen.getByLabelText(/Search Interval/i), { target: { value: '120000' } });
    fireEvent.change(screen.getByLabelText(/Max Results/i), { target: { value: '75' } });
    
    // Submit the form
    fireEvent.click(screen.getByText('Save Configuration'));

    // Check that updateConfig was called with the updated values
    await waitFor(() => {
      expect(api.updateConfig).toHaveBeenCalledWith(expect.objectContaining({
        twitter: expect.objectContaining({
          enabled: false,
          searchInterval: 120000,
          maxResults: 75,
        }),
      }));
    });

    // Check for success message
    await waitFor(() => {
      expect(screen.getByText('Configuration saved successfully!')).toBeInTheDocument();
    });
  });

  test('handles API errors when submitting form', async () => {
    // Mock API error
    api.updateConfig.mockRejectedValue(new Error('Failed to update configuration'));

    render(
      <DashboardProvider>
        <ConfigPage />
      </DashboardProvider>
    );

    // Wait for the config to load
    await waitFor(() => {
      expect(screen.getByText('System Configuration')).toBeInTheDocument();
    });

    // Submit the form
    fireEvent.click(screen.getByText('Save Configuration'));

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/Error saving configuration: Failed to update configuration/i)).toBeInTheDocument();
    });
  });
});