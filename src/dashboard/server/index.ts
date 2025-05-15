import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { createMetricsRoutes } from './routes/metrics.js';
import { createConfigRoutes } from './routes/config.js';
import { createControlRoutes } from './routes/control.js';
import { DashboardService } from './services/dashboard.js';
import { MetricsManager } from '../../core/monitoring/MetricsManager.js';
import { EnhancedMetricsManager } from '../../core/monitoring/EnhancedMetricsManager.js';
import { ConfigManager } from '../../config/ConfigManager.js';
import { Logger } from '../../types/logger.js';
import { LoggerFactory } from '../../logging/LoggerFactory.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private io: SocketIOServer;
  private dashboardService: DashboardService;
  private logger: Logger;
  private port: number;

  constructor(
    metricsManager: MetricsManager,
    enhancedMetricsManager: EnhancedMetricsManager,
    configManager: ConfigManager,
    port: number = 3000
  ) {
    this.logger = LoggerFactory.getInstance().createLogger('DashboardServer');
    this.port = port;
    
    // Create the dashboard service
    this.dashboardService = new DashboardService(
      metricsManager,
      enhancedMetricsManager,
      configManager
    );
    
    // Create the Express app
    this.app = express();
    this.app.use(express.json());
    
    // Create the HTTP server
    this.server = http.createServer(this.app);
    
    // Create the Socket.IO server
    this.io = new SocketIOServer(this.server);
    
    // Set up routes
    this.setupRoutes();
    
    // Set up WebSocket
    this.setupWebSocket();
  }

  /**
   * Set up API routes
   */
  private setupRoutes(): void {
    // API routes
    this.app.use('/api/metrics', createMetricsRoutes(this.dashboardService));
    this.app.use('/api/config', createConfigRoutes(this.dashboardService));
    this.app.use('/api/control', createControlRoutes(this.dashboardService));
    
    // Define the client directory path
    const clientDir = path.join(__dirname, '../../../build/dashboard/client');
    
    this.logger.info(`Serving static files from: ${clientDir}`);
    
    // Serve static files from the client directory
    this.app.use(express.static(clientDir));
    
    // Define specific client-side routes
    const clientRoutes = ['/', '/metrics', '/config', '/topics', '/status', '/overview'];
    
    // Handle client-side routes
    clientRoutes.forEach(route => {
      this.app.get(route, (req, res) => {
        res.sendFile(path.join(clientDir, 'index.html'));
      });
    });
  }

  /**
   * Set up WebSocket for real-time updates
   */
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      this.logger.info(`Client connected: ${socket.id}`);
      
      // Send initial data
      socket.emit('metrics', this.dashboardService.getMetrics());
      socket.emit('topicMetrics', this.dashboardService.getMetricsByTopic());
      socket.emit('config', this.dashboardService.getConfig());
      socket.emit('topicConfig', this.dashboardService.getTopicConfig());
      socket.emit('status', this.dashboardService.getSystemStatus());
      
      // Handle disconnection
      socket.on('disconnect', () => {
        this.logger.info(`Client disconnected: ${socket.id}`);
      });
    });
    
    // Listen for dashboard service events and broadcast to clients
    this.dashboardService.on('config-updated', (config) => {
      this.io.emit('config', config);
    });
    
    this.dashboardService.on('topic-config-updated', (topicConfig) => {
      this.io.emit('topicConfig', topicConfig);
    });
    
    this.dashboardService.on('circuit-breakers-reset', () => {
      this.io.emit('status', this.dashboardService.getSystemStatus());
    });
    
    // Set up periodic updates
    setInterval(() => {
      this.io.emit('metrics', this.dashboardService.getMetrics());
      this.io.emit('topicMetrics', this.dashboardService.getMetricsByTopic());
      this.io.emit('status', this.dashboardService.getSystemStatus());
    }, 5000); // Update every 5 seconds
  }

  /**
   * Start the server
   */
  public start(): void {
    this.server.listen(this.port, () => {
      this.logger.info(`Dashboard server listening on port ${this.port}`);
    });
  }

  /**
   * Stop the server
   */
  public stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

// Export a function to create and start the dashboard server
export function createDashboardServer(
  metricsManager: MetricsManager,
  enhancedMetricsManager: EnhancedMetricsManager,
  configManager: ConfigManager,
  port: number = 3000
): DashboardServer {
  const server = new DashboardServer(
    metricsManager,
    enhancedMetricsManager,
    configManager,
    port
  );
  
  server.start();
  
  return server;
}
