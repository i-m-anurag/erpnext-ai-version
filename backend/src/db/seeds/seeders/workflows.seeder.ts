import { configResolver } from '../../../modules/config/index.js';
import {
  workflowDefinitionSchema,
  WORKFLOW_RESOURCE_TYPE,
  workflowVersionService,
} from '../../../modules/workflow/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/**
 * Seed workflow definitions from seed-data workflows/<slug>.json files.
 *   - base   → scope=base (shipped default, fully validated)
 *   - client → scope=custom (UI/client override)
 * Idempotent; UI edits live in the custom scope and are never clobbered.
 */
export const workflowsSeeder: Seeder = {
  name: 'workflows',
  async run() {
    const slugs = new Set<string>();
    let baseChanged = 0;
    for (const { raw } of baseFiles('workflows')) {
      const wf = workflowDefinitionSchema.parse(raw);
      slugs.add(wf.slug);
      const res = await configResolver.seedResource(
        WORKFLOW_RESOURCE_TYPE,
        wf.slug,
        'base',
        wf as unknown as Record<string, unknown>,
      );
      if (res.changed) baseChanged++;
    }

    let customChanged = 0;
    for (const { file, raw } of clientFiles('workflows')) {
      const obj = raw as Record<string, unknown>;
      const slug = obj.slug;
      if (typeof slug !== 'string') throw new Error(`client workflow ${file} is missing a "slug"`);
      const res = await configResolver.seedResource(WORKFLOW_RESOURCE_TYPE, slug, 'custom', obj);
      if (res.changed) customChanged++;
    }

    // Publish an immutable version for each workflow (only when the resolved
    // definition changed) so documents can pin to it.
    let published = 0;
    for (const slug of slugs) {
      const { changed } = await workflowVersionService.publishIfChanged(slug);
      if (changed) published++;
    }

    logger.info(
      `workflows seeded (base: ${baseChanged} changed; client overrides: ${customChanged} changed; ${published} version(s) published)`,
    );
  },
};
