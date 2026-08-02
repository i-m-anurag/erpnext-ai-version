import { configResolver } from '../../../modules/config/index.js';
import { integrationConfigSchema, INTEGRATION_CONFIG_RESOURCE_TYPE } from '../../../modules/integration/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed per-form integration config (Collatio upload / three-way match) from seed-data. */
export const integrationConfigSeeder: Seeder = {
  name: 'integration-config',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('integration-config')) {
      const cfg = integrationConfigSchema.parse(raw);
      const res = await configResolver.seedResource(
        INTEGRATION_CONFIG_RESOURCE_TYPE,
        cfg.slug,
        'base',
        cfg as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }
    let customChanged = 0;
    for (const { file, raw } of clientFiles('integration-config')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client integration-config ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(INTEGRATION_CONFIG_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }
    logger.info(`integration config seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`);
  },
};
