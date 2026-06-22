import { configResolver } from '../../../modules/config/index.js';
import { namingSeriesSchema, NAMING_SERIES_RESOURCE_TYPE } from '../../../modules/naming/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed naming-series configs from seed-data naming-series/<slug>.json. */
export const namingSeriesSeeder: Seeder = {
  name: 'naming-series',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('naming-series')) {
      const ns = namingSeriesSchema.parse(raw);
      const res = await configResolver.seedResource(
        NAMING_SERIES_RESOURCE_TYPE,
        ns.slug,
        'base',
        ns as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }
    let customChanged = 0;
    for (const { file, raw } of clientFiles('naming-series')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client naming-series ${file} missing "slug"`);
      const res = await configResolver.seedResource(NAMING_SERIES_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }
    logger.info(`naming series seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`);
  },
};
