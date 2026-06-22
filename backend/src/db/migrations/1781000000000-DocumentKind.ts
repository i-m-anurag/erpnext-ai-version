import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registry gains `kind` (master = JSONB store, document = dedicated table) and the
 * generated `table_name`. Existing rows default to 'master', so nothing changes
 * until an entity is flipped to 'document' and its table is synced.
 */
export class DocumentKind1781000000000 implements MigrationInterface {
  name = 'DocumentKind1781000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "master_registry" ADD "kind" character varying(16) NOT NULL DEFAULT 'master'`);
    await queryRunner.query(`ALTER TABLE "master_registry" ADD "table_name" character varying(128)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "master_registry" DROP COLUMN "table_name"`);
    await queryRunner.query(`ALTER TABLE "master_registry" DROP COLUMN "kind"`);
  }
}
