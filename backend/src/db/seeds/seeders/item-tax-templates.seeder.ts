import { AppDataSource } from '../../data-source.js';
import { documentDataService } from '../../../modules/document/index.js';
import { logger } from '../../../config/logger.js';
import { baseFiles } from '../file-loader.js';
import type { Seeder } from '../seeder.js';

/**
 * Seed the standard Item Tax Templates (GST 18% / 12% / 5% / exempt / non-taxable)
 * from seed-data/item-tax-templates/<file>.json. These are DOCUMENT records, so
 * they live in doc_item_tax_template (created by schema-sync), not master_data —
 * hence we create them through the document service rather than masterService.seedData.
 *
 * Idempotent by title (the doc's code); skips any that already exist. Guarded: if
 * the table hasn't been created yet (schema-sync not run), it no-ops instead of
 * failing, so a fresh `npm run seed` before sync:schema still succeeds.
 */
export const itemTaxTemplatesSeeder: Seeder = {
  name: 'item-tax-templates',
  async run() {
    const [table] = (await AppDataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'doc_item_tax_template'`,
    )) as unknown[];
    if (!table) {
      logger.warn('item tax templates: doc_item_tax_template not created yet (run sync:schema) — skipping');
      return;
    }

    let created = 0;
    for (const { raw } of baseFiles('item-tax-templates')) {
      const tpl = raw as { title?: string };
      if (!tpl.title) continue;
      const existing = await documentDataService.getByCode('item-tax-template', tpl.title).catch(() => null);
      if (existing) continue;
      await documentDataService.create('item-tax-template', tpl as Record<string, unknown>);
      created++;
    }
    logger.info(`item tax templates seeded (${created} created)`);
  },
};
