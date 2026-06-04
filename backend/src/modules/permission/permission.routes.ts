import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from './permission.guard.js';
import { permissionController } from './permission.controller.js';
import { createRoleSchema, setRolePermissionsSchema, assignRoleSchema } from './permission.schemas.js';

/**
 * Admin surface for the ACL. Every route requires authentication (gate: session)
 * plus a specific permission (gate 2). The whole router is only mounted when the
 * permission module is enabled (gate 1, in routes.ts).
 */
export function buildPermissionRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/permissions',
    requirePermission('permission', 'permission.read'),
    asyncHandler(permissionController.listPermissions),
  );

  router.get('/roles', requirePermission('permission', 'role.read'), asyncHandler(permissionController.listRoles));
  router.post(
    '/roles',
    requirePermission('permission', 'role.create'),
    validateBody(createRoleSchema),
    asyncHandler(permissionController.createRole),
  );
  router.delete(
    '/roles/:roleId',
    requirePermission('permission', 'role.delete'),
    asyncHandler(permissionController.deleteRole),
  );
  router.put(
    '/roles/:roleId/permissions',
    requirePermission('permission', 'role.update'),
    validateBody(setRolePermissionsSchema),
    asyncHandler(permissionController.setRolePermissions),
  );

  router.get(
    '/users/:userId/permissions',
    requirePermission('permission', 'role.read'),
    asyncHandler(permissionController.getUserPermissions),
  );
  router.post(
    '/users/:userId/roles',
    requirePermission('permission', 'role.assign'),
    validateBody(assignRoleSchema),
    asyncHandler(permissionController.assignRole),
  );
  router.delete(
    '/users/:userId/roles/:roleId',
    requirePermission('permission', 'role.assign'),
    asyncHandler(permissionController.removeRole),
  );

  return router;
}
