import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chart of Accounts (single company). Structural, editable master — plain table
 * (not append-only; only the ledgers are immutable). The tree is `parent_code` →
 * `code`.
 */
export class Accounts1782000000000 implements MigrationInterface {
  name = 'Accounts1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "account" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "deletedAt" timestamptz,
        "code" character varying(64) NOT NULL,
        "name" character varying(140) NOT NULL,
        "parent_code" character varying(64),
        "root_type" character varying(16) NOT NULL,
        "account_type" character varying(32),
        "is_group" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_account" PRIMARY KEY ("id"),
        CONSTRAINT "uq_account_code" UNIQUE ("code")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_account_parent" ON "account" ("parent_code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "account"`);
  }
}
