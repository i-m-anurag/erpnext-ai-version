import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Single-row ledger settings — the period-freeze (posting lock) date. */
export class LedgerSettings1782200000000 implements MigrationInterface {
  name = 'LedgerSettings1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ledger_settings" (
        "id" character varying(16) NOT NULL DEFAULT 'singleton',
        "freeze_date" timestamptz,
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_ledger_settings" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`INSERT INTO "ledger_settings" ("id", "freeze_date") VALUES ('singleton', NULL)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ledger_settings"`);
  }
}
