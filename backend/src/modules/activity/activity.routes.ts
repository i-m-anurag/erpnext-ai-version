import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { activityController } from './activity.controller.js';

/**
 * Activity (timeline + comments) API for any record, keyed by
 * /:entityType/:recordId. `activity:view` to read, `activity:comment` to post.
 */
export function buildActivityRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/:entityType/:recordId/timeline',
    requirePermission('activity', 'view'),
    asyncHandler(activityController.timeline),
  );
  router.get(
    '/:entityType/:recordId/comments',
    requirePermission('activity', 'view'),
    asyncHandler(activityController.listComments),
  );
  router.post(
    '/:entityType/:recordId/comments',
    requirePermission('activity', 'comment'),
    asyncHandler(activityController.addComment),
  );

  return router;
}
