import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { templateController } from './template.controller.js';

/**
 * Email-template management API. `template.read` to view, `template.update` to
 * edit (writes the custom override). Reset removes the override (revert to base).
 */
export function buildTemplateRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', requirePermission('communication', 'template.read'), asyncHandler(templateController.list));
  router.get('/:slug', requirePermission('communication', 'template.read'), asyncHandler(templateController.get));
  router.put('/:slug', requirePermission('communication', 'template.update'), asyncHandler(templateController.save));
  router.post('/:slug/preview', requirePermission('communication', 'template.read'), asyncHandler(templateController.preview));
  router.post('/:slug/test-send', requirePermission('communication', 'template.update'), asyncHandler(templateController.testSend));
  router.delete(
    '/:slug',
    requirePermission('communication', 'template.update'),
    asyncHandler(templateController.reset),
  );

  return router;
}
