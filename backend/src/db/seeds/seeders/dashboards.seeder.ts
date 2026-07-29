import { configResolver } from '../../../modules/config/index.js';
import { dashboardSchema, MODULE_DASHBOARD_RESOURCE_TYPE } from '../../../modules/dashboard/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed per-module dashboards (widgets: stats, charts, tables) from seed-data. */
export const dashboardsSeeder: Seeder = {
  name: 'dashboards',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('dashboards')) {
      const dash = dashboardSchema.parse(raw);
      const res = await configResolver.seedResource(
        MODULE_DASHBOARD_RESOURCE_TYPE,
        dash.slug,
        'base',
        dash as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }
    let customChanged = 0;
    for (const { file, raw } of clientFiles('dashboards')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client dashboard ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(MODULE_DASHBOARD_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }
    logger.info(`dashboards seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`);
  },
};
