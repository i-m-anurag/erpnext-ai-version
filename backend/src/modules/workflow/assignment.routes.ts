import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { assignmentController } from './assignment.controller.js';

/**
 * Assignment API. `GET /mine` is self-scoped (any authenticated user sees only
 * their own tasks) so it needs no extra permission; reading a record's history
 * reuses `workflow:view`; reassigning is privileged (`workflow:assignment.reassign`).
 */
export function buildAssignmentRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(assignmentController.mine));
  router.get(
    '/:masterSlug/:recordId',
    requirePermission('workflow', 'view'),
    asyncHandler(assignmentController.forRecord),
  );
  router.post(
    '/:id/reassign',
    requirePermission('workflow', 'assignment.reassign'),
    asyncHandler(assignmentController.reassign),
  );

  return router;
}
