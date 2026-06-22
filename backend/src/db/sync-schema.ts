import 'reflect-metadata';
import { AppDataSource } from './data-source.js';
import { connectRedis, redis } from './redis.js';
import { logger } from '../config/logger.js';
import { registerAllResourceTypes } from './seeds/register-resources.js';
import { schemaSyncService } from '../modules/document/index.js';

/**
 * Schema-sync: generate/evolve the dedicated tables for every `document` entity
 * from its form JSON. Additive (CREATE/ALTER) only — destructive changes are
 * reported as warnings for a manual migration. Run with `npm run sync:schema`.
 */
async function main(): Promise<void> {
  registerAllResourceTypes();
  await AppDataSource.initialize();
  await connectRedis();

  const results = await schemaSyncService.syncAll();
  for (const r of results) {
    if (r.changes.length === 0) logger.info(`✓ ${r.table}: up to date`);
    else for (const c of r.changes) logger.info(`✓ ${r.table}: ${c}`);
    for (const w of r.warnings) logger.warn(`! ${w}`);
  }
  logger.info(`schema sync complete (${results.length} document tables)`);

  await AppDataSource.destroy().catch(() => undefined);
  await redis.quit().catch(() => undefined);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'schema sync failed');
  process.exit(1);
});
