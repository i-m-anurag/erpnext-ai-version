import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The financial ledger `gl_entry` — append-only and immutable, enforced in the DB.
 * Triggers block UPDATE / DELETE / TRUNCATE so a posted row can never be altered
 * (audit-safe); corrections are reversal entries. `seq` is a monotonic identity for
 * deterministic ordering and a future hash chain. Money is NUMERIC(21,6).
 */
export class GlEntry1782100000000 implements MigrationInterface {
  name = 'GlEntry1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "gl_entry" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seq" bigint GENERATED ALWAYS AS IDENTITY,
        "posting_date" timestamptz NOT NULL,
        "account" character varying(64) NOT NULL,
        "debit" numeric(21,6) NOT NULL DEFAULT 0,
        "credit" numeric(21,6) NOT NULL DEFAULT 0,
        "voucher_type" character varying(64) NOT NULL,
        "voucher_no" character varying(128) NOT NULL,
        "party" character varying(128),
        "against" character varying(255),
        "remarks" character varying(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_gl_entry" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_gl_account" ON "gl_entry" ("account")`);
    await queryRunner.query(`CREATE INDEX "idx_gl_voucher" ON "gl_entry" ("voucher_type", "voucher_no")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_gl_seq" ON "gl_entry" ("seq")`);

    // Append-only enforcement — fires regardless of the client (even a direct psql
    // as the schema owner). Only INSERT and SELECT are possible.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "gl_entry_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'gl_entry is append-only — % is not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "gl_entry_no_update_delete"
        BEFORE UPDATE OR DELETE ON "gl_entry"
        FOR EACH ROW EXECUTE FUNCTION "gl_entry_append_only"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "gl_entry_no_truncate"
        BEFORE TRUNCATE ON "gl_entry"
        FOR EACH STATEMENT EXECUTE FUNCTION "gl_entry_append_only"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "gl_entry_no_truncate" ON "gl_entry"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "gl_entry_no_update_delete" ON "gl_entry"`);
    await queryRunner.query(`DROP TABLE "gl_entry"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "gl_entry_append_only"()`);
  }
}
