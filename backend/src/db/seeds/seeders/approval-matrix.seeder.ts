import { configResolver } from '../../../modules/config/index.js';
import { approvalMatrixSchema, APPROVAL_MATRIX_RESOURCE_TYPE } from '../../../modules/workflow/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed the approval matrix (role×branch→limit) from seed-data. */
export const approvalMatrixSeeder: Seeder = {
  name: 'approval-matrix',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('approval-matrix')) {
      const m = approvalMatrixSchema.parse(raw);
      const res = await configResolver.seedResource(
        APPROVAL_MATRIX_RESOURCE_TYPE,
        m.slug,
        'base',
        m as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }
    let customChanged = 0;
    for (const { file, raw } of clientFiles('approval-matrix')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client approval-matrix ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(APPROVAL_MATRIX_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }
    logger.info(`approval matrix seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`);
  },
};
