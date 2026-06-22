import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { namingAdminService } from './naming.admin.service.js';

function slug(req: Request): string {
  return String(req.params.slug);
}

/** Naming-series management. config:read to view, config:update to edit. */
export function buildNamingRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    requirePermission('config', 'config.read'),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({ series: await namingAdminService.list() });
    }),
  );
  router.get(
    '/:slug',
    requirePermission('config', 'config.read'),
    asyncHandler(async (req: Request, res: Response) => {
      res.json({ series: await namingAdminService.get(slug(req)) });
    }),
  );
  router.put(
    '/:slug',
    requirePermission('config', 'config.update'),
    asyncHandler(async (req: Request, res: Response) => {
      res.json({ series: await namingAdminService.save(slug(req), req.body) });
    }),
  );
  router.delete(
    '/:slug',
    requirePermission('config', 'config.update'),
    asyncHandler(async (req: Request, res: Response) => {
      await namingAdminService.resetOverride(slug(req));
      res.json({ ok: true });
    }),
  );

  return router;
}
