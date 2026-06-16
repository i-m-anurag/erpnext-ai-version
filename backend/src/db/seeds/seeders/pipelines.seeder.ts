import { configResolver } from '../../../modules/config/index.js';
import { pipelineSchema, DOCUMENT_PIPELINE_RESOURCE_TYPE } from '../../../modules/document/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed document pipelines (macro flow: which doc creates which) from seed-data. */
export const pipelinesSeeder: Seeder = {
  name: 'pipelines',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('document-pipelines')) {
      const pl = pipelineSchema.parse(raw);
      const res = await configResolver.seedResource(
        DOCUMENT_PIPELINE_RESOURCE_TYPE,
        pl.slug,
        'base',
        pl as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }
    let customChanged = 0;
    for (const { file, raw } of clientFiles('document-pipelines')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client pipeline ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(DOCUMENT_PIPELINE_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }
    logger.info(`pipelines seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`);
  },
};
