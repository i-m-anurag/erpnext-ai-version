import { configResolver } from '../../../modules/config/index.js';
import { formDefinitionSchema, FORM_RESOURCE_TYPE } from '../../../modules/form/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/**
 * Seed form definitions from seed-data/.
 *   - base/forms/<slug>.json   → scope=base, fully validated (fail fast on a bad base form)
 *   - clients/<slug>/forms/*   → scope=custom, stored as a PARTIAL override (not coerced
 *     with schema defaults, so it patches the base field-by-field via the resolver)
 * Both are idempotent — versions bump only when content actually changes.
 */
export const formsSeeder: Seeder = {
  name: 'forms',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('forms')) {
      const def = formDefinitionSchema.parse(raw);
      const res = await configResolver.seedResource(
        FORM_RESOURCE_TYPE,
        def.slug,
        'base',
        def as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }

    let customChanged = 0;
    for (const { file, raw } of clientFiles('forms')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client form ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(FORM_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }

    logger.info(
      `form definitions seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`,
    );
  },
};
