import { BaseRepository } from '../../../shared/base.repository.js';
import { permissionService, Role } from '../../../modules/permission/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles, clientFiles } from '../file-loader.js';
import { roleFileSchema } from '../seed.schemas.js';
import type { Seeder } from '../seeder.js';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Expand a role's permission spec ("all" | keys | glob patterns) to concrete keys. */
function expandPermissionKeys(spec: 'all' | string[], allKeys: string[]): string[] {
  if (spec === 'all') return allKeys;
  const out = new Set<string>();
  for (const pattern of spec) {
    if (!pattern.includes('*')) {
      out.add(pattern);
      continue;
    }
    const re = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$');
    for (const key of allKeys) if (re.test(key)) out.add(key);
  }
  return [...out];
}

/** Seed roles + their grants from seed-data roles/<code>.json files. */
export const rolesSeeder: Seeder = {
  name: 'roles',
  async run() {
    const roles = new BaseRepository(Role);
    const all = await permissionService.listPermissions();
    const keyToId = new Map(all.map((p) => [`${p.module}:${p.action}`, p.id]));
    const allKeys = [...keyToId.keys()];

    let count = 0;
    for (const { raw } of [...baseFiles('roles'), ...clientFiles('roles')]) {
      const def = roleFileSchema.parse(raw);
      const code = def.code.toLowerCase();

      let role = await roles.findOne({ code });
      if (!role) {
        role = await permissionService.createRole({
          code,
          name: def.name,
          description: def.description ?? null,
          isSystem: def.isSystem ?? false,
        });
      } else if ((def.isSystem ?? false) && !role.isSystem) {
        role.isSystem = true;
        await roles.save(role);
      }

      const keys = expandPermissionKeys(def.permissions, allKeys);
      const ids = keys.map((k) => keyToId.get(k)).filter((id): id is string => Boolean(id));
      await permissionService.setRolePermissions(role.id, ids);
      count++;
    }
    logger.info(`roles seeded (${count} roles)`);
  },
};
