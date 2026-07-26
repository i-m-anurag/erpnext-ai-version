import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stock Ledger Entry — the immutable record of every stock movement, mirroring the
 * discipline of `gl_entry`. One row per document LINE per warehouse effect.
 *
 * The ledger key is (item_code, warehouse); `seq` defines the order within that key.
 * Because back-dating is not permitted (see stock-ledger.service), insertion order IS
 * chronological order, which is what removes the need for ERPNext's "Repost Item
 * Valuation" machinery entirely.
 *
 * `qty_after_transaction`, `valuation_rate` and `stock_value` are the running balance
 * AFTER this movement; `stock_value_difference` is the delta and is the ONLY number
 * that may be posted to the GL — that is what keeps the stock ledger and the general
 * ledger in agreement by construction rather than by reconciliation.
 *
 * Append-only: corrections are reversing entries (negative qty), never updates or
 * deletes — same contract as gl_entry, so there is no `is_cancelled` flag to mutate.
 */
export class StockLedgerEntry1782500000000 implements MigrationInterface {
  name = 'StockLedgerEntry1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "stock_ledger_entry" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "seq" bigint GENERATED ALWAYS AS IDENTITY,
        "posting_date" timestamptz NOT NULL,
        "item_code" character varying(128) NOT NULL,
        "warehouse" character varying(128) NOT NULL,
        -- signed quantity change: positive = receipt, negative = issue
        "actual_qty" numeric(21,6) NOT NULL,
        -- unit cost of the incoming units (receipts); null on issues
        "incoming_rate" numeric(21,6),
        -- unit cost the outgoing units were consumed at (derived); null on receipts
        "outgoing_rate" numeric(21,6),
        -- running balance for (item_code, warehouse) AFTER this movement
        "qty_after_transaction" numeric(21,6) NOT NULL,
        "valuation_rate" numeric(21,6) NOT NULL DEFAULT 0,
        "stock_value" numeric(21,6) NOT NULL DEFAULT 0,
        -- stock_value - previous stock_value; the amount posted to the GL
        "stock_value_difference" numeric(21,6) NOT NULL DEFAULT 0,
        "voucher_type" character varying(64) NOT NULL,
        "voucher_no" character varying(128) NOT NULL,
        -- the document LINE that produced this row (idx or child row id)
        "voucher_detail_no" character varying(64),
        "remarks" character varying(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_stock_ledger_entry" PRIMARY KEY ("id")
      )
    `);
    // Balance lookup: "latest row for this item in this warehouse".
    await queryRunner.query(
      `CREATE INDEX "idx_sle_item_warehouse" ON "stock_ledger_entry" ("item_code", "warehouse", "seq")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sle_voucher" ON "stock_ledger_entry" ("voucher_type", "voucher_no")`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uq_sle_seq" ON "stock_ledger_entry" ("seq")`);

    // Append-only enforcement — same guarantee as gl_entry, at the database level.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "stock_ledger_entry_append_only"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'stock_ledger_entry is append-only — % is not permitted', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER "sle_no_update_delete"
        BEFORE UPDATE OR DELETE ON "stock_ledger_entry"
        FOR EACH ROW EXECUTE FUNCTION "stock_ledger_entry_append_only"()
    `);
    await queryRunner.query(`
      CREATE TRIGGER "sle_no_truncate"
        BEFORE TRUNCATE ON "stock_ledger_entry"
        FOR EACH STATEMENT EXECUTE FUNCTION "stock_ledger_entry_append_only"()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS "sle_no_truncate" ON "stock_ledger_entry"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "sle_no_update_delete" ON "stock_ledger_entry"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "stock_ledger_entry"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS "stock_ledger_entry_append_only"()`);
  }
}
