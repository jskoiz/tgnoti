import { config } from 'dotenv';
import { initializeContainer } from '../src/config/container.js';
import { TYPES } from '../src/types/di.js';
import { MetricsManager } from '../src/core/monitoring/MetricsManager.js';
import { EnhancedMetricsManager } from '../src/core/monitoring/EnhancedMetricsManager.js';
import { ConfigManager } from '../src/config/ConfigManager.js';
import { createDashboardServer } from '../src/dashboard/server/index.js';
import { Logger } from '../src/types/logger.js';

async function startDashboard() {
  // Load environment variables
  config();
  
  console.log('Initializing dashboard server...');
  
  // Initialize the container
  const container = await initializeContainer();
  
  // Get required services from the container
  const metricsManager = container.get<MetricsManager>(TYPES.MetricsManager);
  const enhancedMetricsManager = container.get<EnhancedMetricsManager>(TYPES.EnhancedMetricsManager);
  const configManager = container.get<ConfigManager>(TYPES.ConfigManager);
  const logger = container.get<Logger>(TYPES.Logger);
  
  logger.setComponent('DashboardStarter');
  
  try {
    // Create and start the dashboard server
    const port = process.env.DASHBOARD_PORT ? parseInt(process.env.DASHBOARD_PORT) : 3000;
    const server = createDashboardServer(
      metricsManager,
      enhancedMetricsManager,
      configManager,
      port
    );
    
    logger.info(`Dashboard server started on http://localhost:${port}`);
    logger.info('Press Ctrl+C to stop the server');
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      logger.info('Shutting down dashboard server...');
      await server.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('Failed to start dashboard server:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }
}

startDashboard().catch(error => {
  console.error('Unhandled error in startDashboard:', error);
  process.exit(1);
});