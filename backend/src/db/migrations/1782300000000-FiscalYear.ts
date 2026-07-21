import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Fiscal (financial) years — the reporting windows + year-end-close state. */
export class FiscalYear1782300000000 implements MigrationInterface {
  name = 'FiscalYear1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "fiscal_year" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "name" character varying(32) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "is_default" boolean NOT NULL DEFAULT false,
        "closed" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_fiscal_year" PRIMARY KEY ("id"),
        CONSTRAINT "uq_fiscal_year_name" UNIQUE ("name")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_fiscal_year_range" ON "fiscal_year" ("start_date", "end_date")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "fiscal_year"`);
  }
}
