import { fiscalYearService, type FiscalYearDef } from '../../../modules/ledger/fiscal-year.service.js';
import { logger } from '../../../config/logger.js';
import { baseFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/** Seed fiscal years from seed-data/base/fiscal-years/*.json. */
export const fiscalYearsSeeder: Seeder = {
  name: 'fiscal-years',
  async run() {
    let changed = 0;
    for (const { raw } of baseFiles('fiscal-years')) {
      const defs = (raw as { fiscalYears?: FiscalYearDef[] }).fiscalYears ?? [];
      changed += await fiscalYearService.seed(defs);
    }
    logger.info(`fiscal years seeded (${changed} new)`);
  },
};
