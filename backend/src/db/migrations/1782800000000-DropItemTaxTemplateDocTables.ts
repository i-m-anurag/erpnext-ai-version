import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * item-tax-template was briefly modelled as a `document` doctype, which created
 * doc_item_tax_template (+ __taxes child) via schema-sync. It is now a `master`
 * (rows live in master_data as jsonb), so drop the orphaned document tables.
 * Idempotent — safe whether or not schema-sync ever created them.
 */
export class DropItemTaxTemplateDocTables1782800000000 implements MigrationInterface {
  name = 'DropItemTaxTemplateDocTables1782800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "doc_item_tax_template__taxes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doc_item_tax_template"`);
  }

  public async down(): Promise<void> {
    // No-op: the master (master_data) is the source of truth; the document tables
    // are recreated by schema-sync only if the doctype is reverted to `document`.
  }
}
