import { Router } from 'express';
import { DashboardService } from '../services/dashboard.js';

export function createControlRoutes(dashboardService: DashboardService): Router {
  const router = Router();

  /**
   * POST /api/control/reset-circuit-breakers
   * Reset circuit breakers
   */
  router.post('/reset-circuit-breakers', (req, res) => {
    try {
      const result = dashboardService.resetCircuitBreakers();
      res.json(result);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * GET /api/control/status
   * Get system status
   */
  router.get('/status', (req, res) => {
    try {
      const status = dashboardService.getSystemStatus();
      res.json(status);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}