/**
 * Permission module public API (§5.4). RBAC at (module, action) granularity with
 * a two-gate model (module enablement + permission) and a per-session effective
 * permission snapshot that the auth module reads via the permission-provider seam.
 */
export { buildPermissionRouter } from './permission.routes.js';
export { requirePermission } from './permission.guard.js';
export { permissionService } from './permission.service.js';
export { Permission } from './permission.entity.js';
export { Role } from './role.entity.js';
export { RolePermission } from './role-permission.entity.js';
export { UserRole } from './user-role.entity.js';
export type { PermissionDef } from './permission.catalog.js';
