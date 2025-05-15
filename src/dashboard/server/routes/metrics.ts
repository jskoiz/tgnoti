import { Router } from 'express';
import { DashboardService } from '../services/dashboard.js';

export function createMetricsRoutes(dashboardService: DashboardService): Router {
  const router = Router();

  /**
   * GET /api/metrics
   * Get current metrics
   */
  router.get('/', (req, res) => {
    try {
      const metrics = dashboardService.getMetrics();
      res.json(metrics);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/metrics/topics
   * Get metrics by topic
   */
  router.get('/topics', (req, res) => {
    try {
      const topicMetrics = dashboardService.getMetricsByTopic();
      res.json(topicMetrics);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}