import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { formService } from './form.service.js';

/**
 * Read API for form definitions. The Angular dynamic renderer fetches the
 * resolved (effective) definition for a slug here. Mounted only when the form
 * module is enabled (gate 1); requires `form:view` (gate 2).
 */
export function buildFormRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/:slug',
    requirePermission('form', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      const eff = await formService.getForm(String(req.params.slug));
      res.json({ slug: eff.slug, version: eff.version, resolvedFrom: eff.resolvedFrom, form: eff.definition });
    }),
  );

  return router;
}
