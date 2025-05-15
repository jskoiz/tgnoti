import { io, Socket } from 'socket.io-client';
import { MetricsData, TopicMetricsData, ConfigData, TopicConfigData, SystemStatusData } from './api.js';

/**
 * WebSocket service for real-time updates
 */
export class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.socket) {
      return;
    }

    // Connect to the server
    this.socket = io();

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    // Set up data event listeners
    this.socket.on('metrics', (data: MetricsData) => {
      this.notifyListeners('metrics', data);
    });

    this.socket.on('topicMetrics', (data: TopicMetricsData) => {
      this.notifyListeners('topicMetrics', data);
    });

    this.socket.on('config', (data: ConfigData) => {
      this.notifyListeners('config', data);
    });

    this.socket.on('topicConfig', (data: TopicConfigData) => {
      this.notifyListeners('topicConfig', data);
    });

    this.socket.on('status', (data: SystemStatusData) => {
      this.notifyListeners('status', data);
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Add a listener for a specific event
   * @param event Event name
   * @param callback Callback function
   */
  addListener<T>(event: string, callback: (data: T) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove a listener for a specific event
   * @param event Event name
   * @param callback Callback function
   */
  removeListener<T>(event: string, callback: (data: T) => void): void {
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(callback);
    }
  }

  /**
   * Notify all listeners for a specific event
   * @param event Event name
   * @param data Event data
   */
  private notifyListeners<T>(event: string, data: T): void {
    if (this.listeners.has(event)) {
      for (const callback of this.listeners.get(event)!) {
        callback(data);
      }
    }
  }
}

// Export a singleton instance
export const socketService = new SocketService();