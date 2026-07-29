import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { dashboardService } from './dashboard.service.js';

/** Module dashboards: resolved widgets (config + data) for one module. */
export function buildDashboardRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/:module', asyncHandler(async (req: Request, res: Response) => {
    // Optional ?from=YYYY-MM-DD "since" bound for the whole board's date-range filter.
    const from = typeof req.query.from === 'string' && req.query.from ? req.query.from : undefined;
    res.json(await dashboardService.forModule(String(req.params.module), from));
  }));

  return router;
}
