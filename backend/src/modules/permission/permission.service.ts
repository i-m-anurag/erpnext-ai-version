import { In, type EntityManager } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { AppDataSource } from '../../db/data-source.js';
import { cache } from '../../shared/cache/cache.service.js';
import { ConflictError, NotFoundError, ForbiddenError } from '../../shared/errors.js';
import { sessionService } from '../auth/session.service.js';
import { Permission } from './permission.entity.js';
import { Role } from './role.entity.js';
import { RolePermission } from './role-permission.entity.js';
import { UserRole } from './user-role.entity.js';
import type { PermissionDef } from './permission.catalog.js';

const userPermsKey = (userId: string): string => `perms:user:${userId}`;
const PERMS_TTL_SECONDS = 3600;

/**
 * RBAC engine (§5.4). Computes the effective permission set for a user
 * (the union of their active roles' permissions) and keeps it consistent across
 * the cache and any live sessions when roles or grants change.
 */
export class PermissionService {
  private readonly permissions = new BaseRepository(Permission);
  private readonly roles = new BaseRepository(Role);
  private readonly rolePerms = new BaseRepository(RolePermission);
  private readonly userRoles = new BaseRepository(UserRole);

  /** Effective `module:action` keys for a user, cached (the session snapshot source). */
  async computeEffectivePermissions(userId: string): Promise<string[]> {
    return cache.getOrBuild(userPermsKey(userId), () => this.buildEffective(userId), {
      ttlSeconds: PERMS_TTL_SECONDS,
    });
  }

  private async buildEffective(userId: string): Promise<string[]> {
    const assignments = await this.userRoles.find({ where: { userId } });
    if (assignments.length === 0) return [];

    const roleIds = assignments.map((a) => a.roleId);
    const activeRoles = await this.roles.find({ where: { id: In(roleIds), status: 'active' } });
    const activeRoleIds = activeRoles.map((r) => r.id);
    if (activeRoleIds.length === 0) return [];

    const grants = await this.rolePerms.find({ where: { roleId: In(activeRoleIds) } });
    if (grants.length === 0) return [];

    const permIds = [...new Set(grants.map((g) => g.permissionId))];
    const perms = await this.permissions.find({ where: { id: In(permIds) } });

    return [...new Set(perms.map((p) => `${p.module}:${p.action}`))].sort();
  }

  // ── Catalog & roles ────────────────────────────────────────────────────────

  /**
   * Idempotently upsert permission definitions (from the seed-data files).
   * Returns the count of newly-created permissions.
   */
  async upsertPermissions(defs: PermissionDef[], manager?: EntityManager): Promise<number> {
    const repo = manager ? this.permissions.withManager(manager) : this.permissions;
    let count = 0;
    for (const def of defs) {
      const existing = await repo.findOne({ module: def.module, action: def.action });
      if (existing) {
        if (existing.description !== def.description) {
          existing.description = def.description;
          await repo.save(existing);
        }
      } else {
        await repo.save(repo.create(def));
        count++;
      }
    }
    return count;
  }

  listPermissions(): Promise<Permission[]> {
    return this.permissions.find({ order: { module: 'ASC', action: 'ASC' } });
  }

  listRoles(): Promise<Role[]> {
    return this.roles.find({ order: { code: 'ASC' } });
  }

  async createRole(input: {
    code: string;
    name: string;
    description?: string | null;
    isSystem?: boolean;
  }): Promise<Role> {
    const code = input.code.toLowerCase();
    if (await this.roles.exists({ code })) {
      throw new ConflictError(`Role already exists: ${code}`);
    }
    return this.roles.save(
      this.roles.create({
        code,
        name: input.name,
        description: input.description ?? null,
        isSystem: input.isSystem ?? false,
      }),
    );
  }

  async deleteRole(roleId: string): Promise<void> {
    const role = await this.roles.findById(roleId);
    if (!role) throw new NotFoundError('Role not found');
    if (role.isSystem) throw new ForbiddenError('System roles cannot be deleted');
    const affected = await this.userIdsWithRole(roleId);
    await this.roles.softDelete(roleId);
    await Promise.all(affected.map((uid) => this.recomputeAndPropagate(uid)));
  }

  /** Set (replace) the permissions granted to a role, then propagate to users. */
  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    const role = await this.roles.findById(roleId);
    if (!role) throw new NotFoundError('Role not found');

    await AppDataSource.transaction(async (manager) => {
      const rpRepo = manager.getRepository(RolePermission);
      await rpRepo.delete({ roleId });
      if (permissionIds.length) {
        await rpRepo.insert(permissionIds.map((permissionId) => ({ roleId, permissionId })));
      }
    });

    const affected = await this.userIdsWithRole(roleId);
    await Promise.all(affected.map((uid) => this.recomputeAndPropagate(uid)));
  }

  // ── Assignment ───────────────────────────────────────────────────────────

  async assignRole(userId: string, roleId: string): Promise<void> {
    if (!(await this.roles.exists({ id: roleId }))) throw new NotFoundError('Role not found');
    if (!(await this.userRoles.exists({ userId, roleId }))) {
      await this.userRoles.save(this.userRoles.create({ userId, roleId }));
    }
    await this.recomputeAndPropagate(userId);
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    await AppDataSource.getRepository(UserRole).delete({ userId, roleId });
    await this.recomputeAndPropagate(userId);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async userIdsWithRole(roleId: string): Promise<string[]> {
    const rows = await this.userRoles.find({ where: { roleId } });
    return [...new Set(rows.map((r) => r.userId))];
  }

  /**
   * After any change to a user's effective permissions: drop the cache, rebuild,
   * and push the fresh snapshot into all of that user's live sessions (§5.8) so
   * access changes take effect without forcing a re-login.
   */
  private async recomputeAndPropagate(userId: string): Promise<void> {
    await cache.invalidate(userPermsKey(userId));
    const perms = await this.computeEffectivePermissions(userId);
    await sessionService.refreshPermissionsForUser(userId, perms);
  }
}

export const permissionService = new PermissionService();
