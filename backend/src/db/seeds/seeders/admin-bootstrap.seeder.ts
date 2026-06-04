import { BaseRepository } from '../../../shared/base.repository.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { User, authService } from '../../../modules/auth/index.js';
import { permissionService, Role } from '../../../modules/permission/index.js';
import type { Seeder } from '../seeder.js';

/**
 * Bootstrap the first admin user from config (config/*.json → admin.*). On first
 * run: create the user (no password), grant the admin role, and send a welcome /
 * set-password email. Idempotent: if the user already exists, only ensure the
 * admin role is assigned — no duplicate user, no repeat email.
 */
export const adminBootstrapSeeder: Seeder = {
  name: 'admin-bootstrap',
  async run() {
    const users = new BaseRepository(User);
    const roles = new BaseRepository(Role);

    const adminRole = await roles.findOne({ code: 'admin' });
    if (!adminRole) throw new Error('admin role missing — run system-roles seeder first');

    const username = env.admin.username.toLowerCase();
    const existing = await users.findOne({ username });

    if (existing) {
      await permissionService.assignRole(existing.id, adminRole.id);
      logger.info(`admin user '${username}' already exists — ensured admin role`);
      return;
    }

    const user = await users.save(
      users.create({
        username,
        email: env.admin.email.toLowerCase(),
        displayName: env.admin.displayName,
        isFirstLogin: true,
      }),
    );
    await permissionService.assignRole(user.id, adminRole.id);
    await authService.sendWelcome(user.id);
    logger.info(`admin user '${username}' created, admin role granted, welcome email sent to ${user.email}`);
  },
};
