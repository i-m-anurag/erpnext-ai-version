import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { BadRequestError } from '../../shared/errors.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { documentService } from './document.service.js';

function p(req: Request, name: string): string {
  return String(req.params[name]);
}

/**
 * Document chaining API: lineage + create-options for a record, and create-next.
 * Reads need master:view; creating the next document needs master:create.
 */
export function buildDocumentRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/:master/:code/links',
    requirePermission('master', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      const master = p(req, 'master');
      const code = p(req, 'code');
      res.json({
        related: await documentService.links(master, code),
        createOptions: await documentService.createOptions(master, code),
      });
    }),
  );

  router.post(
    '/:master/:code/create-next',
    requirePermission('master', 'create'),
    asyncHandler(async (req: Request, res: Response) => {
      const toMaster = String((req.body as { toMaster?: unknown })?.toMaster ?? '');
      if (!toMaster) throw new BadRequestError('toMaster is required');
      const created = await documentService.createNext(p(req, 'master'), p(req, 'code'), toMaster, req.auth!.userId);
      res.status(201).json({ created });
    }),
  );

  return router;
}
