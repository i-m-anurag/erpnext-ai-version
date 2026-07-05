import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { assignmentController } from './assignment.controller.js';

/**
 * Assignment API. "My work" is available to any authenticated user (their own
 * list); reading a record's history needs `workflow:view`; reassigning needs
 * `workflow:transition`.
 */
export function buildAssignmentRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(assignmentController.mine));
  router.get('/:master/:code', requirePermission('workflow', 'view'), asyncHandler(assignmentController.forRecord));
  router.post('/:id/reassign', requirePermission('workflow', 'transition'), asyncHandler(assignmentController.reassign));

  return router;
}
