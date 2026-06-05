import { BaseRepository } from '../../../shared/base.repository.js';
import { env } from '../../../config/env.js';
import { logger } from '../../../config/logger.js';
import { User, authService } from '../../../modules/auth/index.js';
import { passwordService } from '../../../modules/auth/password.service.js';
import { permissionService, Role } from '../../../modules/permission/index.js';
import type { Seeder } from '../seeder.js';

/**
 * Bootstrap the first admin user from config (config/*.json → admin.*), idempotently.
 *
 *  - If config.admin.password is set: the admin is created WITH that password and
 *    can log in immediately (dev / fresh-checkout convenience). A pre-existing
 *    admin that has no password yet is also recovered to this password.
 *  - If no password is configured: the admin is created WITHOUT one and receives a
 *    welcome / set-password email (the production-correct flow).
 */
export const adminBootstrapSeeder: Seeder = {
  name: 'admin-bootstrap',
  async run() {
    const users = new BaseRepository(User);
    const roles = new BaseRepository(Role);

    const adminRole = await roles.findOne({ code: 'admin' });
    if (!adminRole) throw new Error('admin role missing — run system-roles seeder first');

    const username = env.admin.username.toLowerCase();
    const configuredPassword = env.admin.password;
    const existing = await users.findOne({ username });

    if (existing) {
      await permissionService.assignRole(existing.id, adminRole.id);
      // Recover an admin that never got a password (e.g. seeded via welcome flow,
      // then a password was added to config). Never clobber an existing password.
      if (configuredPassword && !existing.passwordHash) {
        existing.passwordHash = await passwordService.hash(configuredPassword);
        existing.isFirstLogin = false;
        await users.save(existing);
        logger.info(`admin user '${username}' existed without a password — set from config`);
      } else {
        logger.info(`admin user '${username}' already exists — ensured admin role`);
      }
      return;
    }

    const user = await users.save(
      users.create({
        username,
        email: env.admin.email.toLowerCase(),
        displayName: env.admin.displayName,
        isFirstLogin: !configuredPassword,
        passwordHash: configuredPassword ? await passwordService.hash(configuredPassword) : null,
      }),
    );
    await permissionService.assignRole(user.id, adminRole.id);

    if (configuredPassword) {
      logger.info(`admin user '${username}' created with a password from config (can log in now)`);
    } else {
      await authService.sendWelcome(user.id);
      logger.info(`admin user '${username}' created; welcome/set-password email sent to ${user.email}`);
    }
  },
};
