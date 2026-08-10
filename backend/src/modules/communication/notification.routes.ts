import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { notificationController } from './notification.controller.js';

/**
 * In-app notification feed. Every route is self-scoped (the caller only ever sees
 * or mutates their own notifications), so auth is the only gate.
 */
export function buildNotificationRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/mine', asyncHandler(notificationController.mine));
  router.get('/mine/count', asyncHandler(notificationController.count));
  router.post('/read-all', asyncHandler(notificationController.markAllRead));
  router.post('/:id/read', asyncHandler(notificationController.markRead));

  return router;
}
