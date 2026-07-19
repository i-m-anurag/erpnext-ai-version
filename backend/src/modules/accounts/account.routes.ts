import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { accountService } from './account.service.js';

/** Chart of Accounts API (read-only in this phase — the CoA is seeded). */
export function buildAccountRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ accounts: await accountService.list() });
  }));

  router.get('/tree', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ tree: await accountService.tree() });
  }));

  // Leaf accounts as picker options — declared before '/:code' so it isn't captured.
  router.get('/options', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ options: await accountService.options() });
  }));

  router.get('/:code', asyncHandler(async (req: Request, res: Response) => {
    res.json({ account: await accountService.getByCode(String(req.params.code)) });
  }));

  return router;
}
