import { masterService } from '../../../modules/master/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import { masterFileSchema } from '../seed.schemas.js';
import type { Seeder } from '../seeder.js';

/**
 * Seed the master registry AND seeded master rows from seed-data masters/<slug>.json.
 * Registry entries are upserted; any `data` rows are seeded into the generic
 * master-data store (idempotent by code).
 */
export const mastersSeeder: Seeder = {
  name: 'masters',
  async run() {
    const files = [...baseFiles('masters'), ...clientFiles('masters')];
    let rowsChanged = 0;
    for (const { raw } of files) {
      const m = masterFileSchema.parse(raw);
      await masterService.upsertRegistry({
        slug: m.slug,
        name: m.name,
        managedBy: m.managedBy,
        editable: m.editable,
        formSlug: m.formSlug ?? null,
        cacheTtlSeconds: m.cacheTtlSeconds,
        codeField: m.codeField,
        labelField: m.labelField,
      });
      if (m.data?.length) {
        rowsChanged += await masterService.seedData(m.slug, m.data);
      }
    }
    logger.info(`master registry seeded (${files.length} masters, ${rowsChanged} rows changed)`);
  },
};
