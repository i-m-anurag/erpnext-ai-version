import 'reflect-metadata';
import { AppDataSource } from '../data-source.js';
import { connectRedis, redis } from '../redis.js';
import { logger } from '../../config/logger.js';
import { registerAllResourceTypes } from './register-resources.js';
import type { Seeder } from './seeder.js';
import { permissionsSeeder } from './seeders/permissions.seeder.js';
import { rolesSeeder } from './seeders/roles.seeder.js';
import { mastersSeeder } from './seeders/masters.seeder.js';
import { formsSeeder } from './seeders/forms.seeder.js';
import { emailTemplatesSeeder } from './seeders/email-templates.seeder.js';
import { adminBootstrapSeeder } from './seeders/admin-bootstrap.seeder.js';

/**
 * Idempotent base-data seeding from the seed-data/ files (§7). Order matters:
 * permissions → roles (grant from permissions) → masters → forms → email templates
 * → admin (bootstrap sends a welcome email, so its template must exist first).
 * Re-running on upgrade re-applies shipped base defaults and the active client's
 * overrides without disturbing in-app customizations.
 */
const seeders: Seeder[] = [
  permissionsSeeder,
  rolesSeeder,
  mastersSeeder,
  formsSeeder,
  emailTemplatesSeeder,
  adminBootstrapSeeder,
];

async function main(): Promise<void> {
  registerAllResourceTypes();
  await AppDataSource.initialize();
  await connectRedis();
  logger.info('running seeders…');

  for (const seeder of seeders) {
    await seeder.run();
    logger.info(`✓ seeded: ${seeder.name}`);
  }

  await AppDataSource.destroy();
  await redis.quit();
  logger.info('seeding complete');
}

main().catch((err) => {
  logger.error({ err }, 'seeding failed');
  process.exit(1);
});
