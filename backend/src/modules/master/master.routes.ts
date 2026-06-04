import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { masterController } from './master.controller.js';

/**
 * Master registry + data API. Demonstrates the two granularities of ACL (§5.4):
 *   - `master:view`  → route/screen access: list registry, read rows + options
 *   - `master:create|update|delete` → in-screen actions on the data
 * A user granted only `master:view` can read everything but is blocked (403) from
 * any mutation. Mounted only when the master module is enabled (gate 1).
 */
export function buildMasterRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Read (screen access)
  router.get('/', requirePermission('master', 'view'), asyncHandler(masterController.list));
  router.get('/:slug', requirePermission('master', 'view'), asyncHandler(masterController.get));
  router.get('/:slug/options', requirePermission('master', 'view'), asyncHandler(masterController.options));
  router.get('/:slug/data', requirePermission('master', 'view'), asyncHandler(masterController.listData));

  // Actions
  router.post('/:slug/data', requirePermission('master', 'create'), asyncHandler(masterController.createData));
  router.put('/:slug/data/:id', requirePermission('master', 'update'), asyncHandler(masterController.updateData));
  router.delete('/:slug/data/:id', requirePermission('master', 'delete'), asyncHandler(masterController.deleteData));

  return router;
}
