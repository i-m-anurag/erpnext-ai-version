import { ConfigResource } from '../modules/config/config-resource.entity.js';
import { User } from '../modules/auth/user.entity.js';
import { PasswordResetToken } from '../modules/auth/password-reset-token.entity.js';
import { Permission } from '../modules/permission/permission.entity.js';
import { Role } from '../modules/permission/role.entity.js';
import { RolePermission } from '../modules/permission/role-permission.entity.js';
import { UserRole } from '../modules/permission/user-role.entity.js';
import { MasterRegistry } from '../modules/master/master-registry.entity.js';
import { MasterData } from '../modules/master/master-data.entity.js';

/**
 * Explicit entity registry. Listed by import (not a filesystem glob) so the
 * metadata is registered consistently under every runtime — tsx (dev), compiled
 * JS (prod), and the Vitest/SWC transform (tests). Add new entities here.
 */
export const entities = [
  ConfigResource,
  User,
  PasswordResetToken,
  Permission,
  Role,
  RolePermission,
  UserRole,
  MasterRegistry,
  MasterData,
];
