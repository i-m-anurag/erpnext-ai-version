import { permissionService, type PermissionDef } from '../../../modules/permission/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import { permissionsFileSchema } from '../seed.schemas.js';
import type { Seeder } from '../seeder.js';

/** Seed the permission catalog from seed-data permissions/<module>.json files. */
export const permissionsSeeder: Seeder = {
  name: 'permissions',
  async run() {
    const defs: PermissionDef[] = [];
    for (const { raw } of [...baseFiles('permissions'), ...clientFiles('permissions')]) {
      const parsed = permissionsFileSchema.parse(raw);
      for (const p of parsed.permissions) {
        defs.push({ module: parsed.module, action: p.action, description: p.description });
      }
    }
    const added = await permissionService.upsertPermissions(defs);
    logger.info(`permissions seeded (${defs.length} defs, ${added} new)`);
  },
};
