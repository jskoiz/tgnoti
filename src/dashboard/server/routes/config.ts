import { Router } from 'express';
import { DashboardService } from '../services/dashboard.js';

export function createConfigRoutes(dashboardService: DashboardService): Router {
  const router = Router();

  /**
   * GET /api/config
   * Get current configuration
   */
  router.get('/', (req, res) => {
    try {
      const config = dashboardService.getConfig();
      res.json(config);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/config
   * Update configuration
   */
  router.put('/', async (req, res) => {
    try {
      const config = req.body;
      const updatedConfig = await dashboardService.updateConfig(config);
      res.json(updatedConfig);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/config/topics
   * Get topic configuration
   */
  router.get('/topics', (req, res) => {
    try {
      const topicConfig = dashboardService.getTopicConfig();
      res.json(topicConfig);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * PUT /api/config/topics
   * Update topic configuration
   */
  router.put('/topics', async (req, res) => {
    try {
      const topicConfig = req.body;
      const updatedTopicConfig = await dashboardService.updateTopicConfig(topicConfig);
      res.json(updatedTopicConfig);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}