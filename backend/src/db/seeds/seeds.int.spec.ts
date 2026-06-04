import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppDataSource } from '../data-source.js';
import { connectRedis, redis } from '../redis.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { registerAllResourceTypes } from './register-resources.js';
import { configResolver } from '../../modules/config/index.js';
import { permissionService, Role } from '../../modules/permission/index.js';
import { MasterRegistry } from '../../modules/master/index.js';
import { User } from '../../modules/auth/index.js';
import { env } from '../../config/env.js';
import type { FormDefinition } from '../../modules/form/index.js';

import { permissionsSeeder } from './seeders/permissions.seeder.js';
import { rolesSeeder } from './seeders/roles.seeder.js';
import { mastersSeeder } from './seeders/masters.seeder.js';
import { formsSeeder } from './seeders/forms.seeder.js';
import { emailTemplatesSeeder } from './seeders/email-templates.seeder.js';
import { adminBootstrapSeeder } from './seeders/admin-bootstrap.seeder.js';

describe('seeders (integration)', () => {
  let allKeys: string[];

  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    for (const s of [permissionsSeeder, rolesSeeder, mastersSeeder, formsSeeder, emailTemplatesSeeder, adminBootstrapSeeder]) {
      await s.run();
    }
  });

  afterAll(async () => {
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('seeds the permission catalog', async () => {
    const perms = await permissionService.listPermissions();
    allKeys = perms.map((p) => `${p.module}:${p.action}`).sort();
    expect(perms.length).toBeGreaterThanOrEqual(12);
  });

  it('seeds protected system roles', async () => {
    const roles = new BaseRepository(Role);
    expect((await roles.findOne({ code: 'admin' }))?.isSystem).toBe(true);
    expect((await roles.findOne({ code: 'viewer' }))?.isSystem).toBe(true);
  });

  it('bootstraps an admin with every permission', async () => {
    const users = new BaseRepository(User);
    const admin = await users.findOne({ username: env.admin.username.toLowerCase() });
    expect(admin).toBeTruthy();
    expect(await permissionService.computeEffectivePermissions(admin!.id)).toEqual(allKeys);
  });

  it('seeds the master registry with the expected slugs', async () => {
    const masters = await new BaseRepository(MasterRegistry).find();
    const bySlug = new Map(masters.map((m) => [m.slug, m]));
    for (const slug of ['country', 'currency', 'uom', 'vendor-category', 'item']) {
      expect(bySlug.has(slug)).toBe(true);
    }
    expect(bySlug.get('country')!.managedBy).toBe('seeded');
    expect(bySlug.get('vendor-category')!.formSlug).toBe('master-vendor-category');
  });

  it('resolves a seeded base form through the config pipeline', async () => {
    const form = await configResolver.resolve<FormDefinition>('form', 'vendor-onboarding');
    expect(form.resolvedFrom).toBe('base');
    expect(form.definition.title).toBe('Vendor Onboarding');
  });
});
