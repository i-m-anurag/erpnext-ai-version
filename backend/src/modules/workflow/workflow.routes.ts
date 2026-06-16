import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { workflowController } from './workflow.controller.js';

/**
 * Workflow API for a record: read the current state + my available actions, and
 * perform a transition. `workflow:view` to read, `workflow:transition` to act
 * (role + condition are further enforced per-transition in the service).
 */
export function buildWorkflowRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/:masterSlug/:recordId/status',
    requirePermission('workflow', 'view'),
    asyncHandler(workflowController.status),
  );
  router.post(
    '/:masterSlug/:recordId/transition',
    requirePermission('workflow', 'transition'),
    asyncHandler(workflowController.transition),
  );

  return router;
}
