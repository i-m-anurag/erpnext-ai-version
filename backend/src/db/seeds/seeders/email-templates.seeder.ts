import { configResolver } from '../../../modules/config/index.js';
import { emailTemplateSchema, EMAIL_TEMPLATE_RESOURCE_TYPE } from '../../../modules/communication/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/**
 * Seed email templates from seed-data email-templates/<slug>.json files.
 *   - base   → scope=base, fully validated
 *   - client → scope=custom, partial override (patches subject/html/variables)
 * Idempotent (versions bump only on content change).
 */
export const emailTemplatesSeeder: Seeder = {
  name: 'email-templates',
  async run() {
    let baseChanged = 0;
    for (const { raw } of baseFiles('email-templates')) {
      const tpl = emailTemplateSchema.parse(raw);
      const res = await configResolver.seedResource(
        EMAIL_TEMPLATE_RESOURCE_TYPE,
        tpl.slug,
        'base',
        tpl as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }

    let customChanged = 0;
    for (const { file, raw } of clientFiles('email-templates')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client email-template ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(EMAIL_TEMPLATE_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }

    logger.info(
      `email templates seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed)`,
    );
  },
};
