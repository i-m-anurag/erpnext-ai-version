import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { workflowAdminService } from './workflow.admin.service.js';

function slug(req: Request): string {
  return String(req.params.slug);
}

/**
 * Workflow DEFINITION management (the configurator). `workflow:view` to read,
 * `workflow:configure` to edit (writes the custom override).
 */
export function buildWorkflowAdminRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    requirePermission('workflow', 'view'),
    asyncHandler(async (_req: Request, res: Response) => {
      res.json({ workflows: await workflowAdminService.list() });
    }),
  );
  router.get(
    '/:slug',
    requirePermission('workflow', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      res.json({ workflow: await workflowAdminService.get(slug(req)) });
    }),
  );
  router.put(
    '/:slug',
    requirePermission('workflow', 'configure'),
    asyncHandler(async (req: Request, res: Response) => {
      res.json({ workflow: await workflowAdminService.save(slug(req), req.body) });
    }),
  );
  router.delete(
    '/:slug',
    requirePermission('workflow', 'configure'),
    asyncHandler(async (req: Request, res: Response) => {
      await workflowAdminService.resetOverride(slug(req));
      res.json({ ok: true });
    }),
  );

  return router;
}
