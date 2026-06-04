import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { User } from '../auth/user.entity.js';
import { sessionService } from '../auth/session.service.js';
import { setPermissionResolver, resolvePermissions } from '../auth/permission-provider.js';
import { permissionService } from './permission.service.js';
import { Permission } from './permission.entity.js';
import { Role } from './role.entity.js';

const USERNAME = '__it_perm_user';
const ROLE_CODE = '__it_perm_role';

describe('permission / ACL (integration)', () => {
  const users = new BaseRepository(User);
  const roles = new BaseRepository(Role);
  const perms = new BaseRepository(Permission);
  let userId: string;
  let roleId: string;
  let roleReadId: string;
  let roleCreateId: string;

  beforeAll(async () => {
    await AppDataSource.initialize();
    await connectRedis();
    const priorRole = await roles.findOne({ code: ROLE_CODE });
    if (priorRole) await AppDataSource.getRepository(Role).delete(priorRole.id);
    const priorUser = await users.findOne({ username: USERNAME });
    if (priorUser) {
      await sessionService.revokeAllForUser(priorUser.id);
      await users.delete(priorUser.id);
    }
    await permissionService.upsertPermissions([
      { module: 'permission', action: 'role.read', description: 'View roles and assignments' },
      { module: 'permission', action: 'role.create', description: 'Create roles' },
    ]);
    roleReadId = (await perms.findOne({ module: 'permission', action: 'role.read' }))!.id;
    roleCreateId = (await perms.findOne({ module: 'permission', action: 'role.create' }))!.id;
  });

  afterAll(async () => {
    await sessionService.revokeAllForUser(userId);
    if (roleId) await AppDataSource.getRepository(Role).delete(roleId);
    await users.delete(userId);
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('computes effective permissions from assigned roles', async () => {
    const role = await permissionService.createRole({ code: ROLE_CODE, name: 'IT Role' });
    roleId = role.id;
    await permissionService.setRolePermissions(roleId, [roleReadId]);
    const user = await users.save(users.create({ username: USERNAME, email: `${USERNAME}@erp.local`, isFirstLogin: false }));
    userId = user.id;
    await permissionService.assignRole(userId, roleId);
    expect(await permissionService.computeEffectivePermissions(userId)).toEqual(['permission:role.read']);
  });

  it('exposes the same set through the auth resolver seam', async () => {
    setPermissionResolver((uid) => permissionService.computeEffectivePermissions(uid));
    expect(await resolvePermissions(userId)).toEqual(['permission:role.read']);
  });

  it('propagates grant changes to live sessions without re-login', async () => {
    const eff = await permissionService.computeEffectivePermissions(userId);
    const { sessionId } = await sessionService.create({ userId, currentRefreshJti: 'jti', permissions: eff });
    await permissionService.setRolePermissions(roleId, [roleReadId, roleCreateId]);
    const live = await sessionService.get(sessionId);
    expect(live?.permissions).toContain('permission:role.create');
    expect(live?.permissions).toContain('permission:role.read');
  });

  it('clears permissions everywhere when the role is unassigned', async () => {
    const { sessionId } = await sessionService.create({ userId, currentRefreshJti: 'jti2', permissions: ['permission:role.read'] });
    await permissionService.removeRole(userId, roleId);
    expect(await permissionService.computeEffectivePermissions(userId)).toEqual([]);
    expect((await sessionService.get(sessionId))?.permissions).toEqual([]);
  });
});
