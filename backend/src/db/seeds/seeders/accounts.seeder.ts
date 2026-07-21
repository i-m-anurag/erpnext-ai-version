import { accountService, type AccountDef } from '../../../modules/accounts/account.service.js';
import { logger } from '../../../config/logger.js';
import { baseFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed the single-company Chart of Accounts from seed-data/base/accounts/*.json. */
export const accountsSeeder: Seeder = {
  name: 'accounts',
  async run() {
    let changed = 0;
    for (const { raw } of baseFiles('accounts')) {
      const defs = (raw as { accounts?: AccountDef[] }).accounts ?? [];
      changed += await accountService.seed(defs);
    }
    logger.info(`chart of accounts seeded (${changed} changed)`);
  },
};
