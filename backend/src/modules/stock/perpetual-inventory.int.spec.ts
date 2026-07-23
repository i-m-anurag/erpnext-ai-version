import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { accountsSeeder } from '../../db/seeds/seeders/accounts.seeder.js';
import { formsSeeder } from '../../db/seeds/seeders/forms.seeder.js';
import { mastersSeeder } from '../../db/seeds/seeders/masters.seeder.js';
import { namingSeriesSeeder } from '../../db/seeds/seeders/naming-series.seeder.js';
import { pipelinesSeeder } from '../../db/seeds/seeders/pipelines.seeder.js';
import { registerPostingRules } from '../ledger/register-posting-rules.js';
import { registerFormControllers } from '../form-logic/index.js';
import { masterService } from '../master/index.js';
import { stockReportService } from './stock-report.service.js';

/**
 * Perpetual inventory: every movement of stock is also a movement of money, and the
 * two must never disagree. These tests assert the accounting an auditor would check —
 * that the entry is on the right side of the right account, that a transfer creates no
 * value out of nothing, and that Stock Received But Not Billed nets to zero once the
 * supplier's invoice arrives.
 */
const ITEM = 'ITM-9001-PERP'; // dedicated to this spec, so other specs can't perturb it
const WH = 'Main Store';
const WH2 = 'Work In Progress';

/** Net movement on an account for one voucher: debit − credit. */
async function accountMovement(account: string, voucherNo: string): Promise<number> {
  const [r] = (await AppDataSource.query(
    `SELECT COALESCE(SUM(debit - credit), 0) AS net FROM gl_entry WHERE account = $1 AND voucher_no = $2`,
    [account, voucherNo],
  )) as { net: string }[];
  return Number(r?.net ?? 0);
}

/** Every GL line a voucher produced, as [account, debit, credit]. */
async function glLines(voucherNo: string): Promise<[string, number, number][]> {
  const rows = (await AppDataSource.query(
    `SELECT account, debit, credit FROM gl_entry WHERE voucher_no = $1 ORDER BY seq`,
    [voucherNo],
  )) as { account: string; debit: string; credit: string }[];
  return rows.map((r) => [r.account, Number(r.debit), Number(r.credit)]);
}

/** Vouchers this spec created, so their GL entries can be cleaned up with them. */
const created: string[] = [];

/**
 * Remove BOTH ledgers' fixture rows. Dropping the stock rows alone would leave the GL
 * postings behind, and every run would then add permanent drift to the very report
 * these tests exercise — the reconciliation screen on the dev database would fill up
 * with phantom differences. Both ledgers are append-only, so this lifts their guards;
 * that is a test-teardown privilege, not something the application can do.
 */
async function wipeFixture(): Promise<void> {
  await AppDataSource.query('ALTER TABLE stock_ledger_entry DISABLE TRIGGER sle_no_update_delete');
  await AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]);
  await AppDataSource.query('ALTER TABLE stock_ledger_entry ENABLE TRIGGER sle_no_update_delete');

  if (created.length > 0) {
    await AppDataSource.query('ALTER TABLE gl_entry DISABLE TRIGGER gl_entry_no_update_delete');
    await AppDataSource.query(`DELETE FROM gl_entry WHERE voucher_no = ANY($1)`, [created]);
    await AppDataSource.query('ALTER TABLE gl_entry ENABLE TRIGGER gl_entry_no_update_delete');
    created.length = 0;
  }
}

/** Create a document and remember it, so teardown can undo its GL posting. */
async function submit(slug: string, data: Record<string, unknown>): Promise<{ code: string }> {
  const row = await masterService.createData(slug, data);
  created.push(row.code);
  return row;
}

const receipt = (qty: number, rate: number) => ({
  date: '2026-08-01',
  supplier: 'Acme Supplies',
  company: 'IQ-SMART',
  items: [{ item: ITEM, quantity: qty, warehouse: WH, uom: 'EA', rate }],
});

describe('perpetual inventory: stock ledger → general ledger (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await accountsSeeder.run();
    await formsSeeder.run();
    await mastersSeeder.run();
    await namingSeriesSeeder.run();
    await pipelinesSeeder.run();
    registerPostingRules();
    registerFormControllers();
  });

  beforeEach(wipeFixture);

  afterAll(async () => {
    await wipeFixture();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('a receipt debits Stock In Hand and credits Stock Received But Not Billed', async () => {
    const pr = await submit('purchase-receipt', receipt(40, 25)); // ₹1,000

    expect(await glLines(pr.code)).toEqual([
      ['stock-in-hand', 1000, 0],
      ['stock-received-not-billed', 0, 1000],
    ]);
  });

  it('the invoice that follows clears SRBNB to nil instead of expensing the goods again', async () => {
    const pr = await submit('purchase-receipt', receipt(40, 25));
    const pi = await submit('purchase-invoice', {
      date: '2026-08-02',
      supplier: 'Acme Supplies',
      company: 'IQ-SMART',
      purpose: 'PURCHASE',
      currency: 'INR',
      priceList: 'Standard Buying',
      purchaseReceipt: pr.code,
      items: [{ item: ITEM, quantity: 40, warehouse: WH, uom: 'EA', rate: 25 }],
      grandTotal: 1000,
    });

    // receipt credited SRBNB 1000, invoice debits it back → the holding account is flat
    const srbnb = (await accountMovement('stock-received-not-billed', pr.code)) +
      (await accountMovement('stock-received-not-billed', pi.code));
    expect(srbnb).toBe(0);

    // the goods were never expensed — they are an asset until they are consumed
    expect(await accountMovement('purchase-expenses', pi.code)).toBe(0);
    expect(await accountMovement('creditors', pi.code)).toBe(-1000); // credit → owed to supplier
  });

  it('an invoice with no receipt behind it still expenses the purchase directly', async () => {
    const pi = await submit('purchase-invoice', {
      date: '2026-08-02',
      supplier: 'Acme Supplies',
      company: 'IQ-SMART',
      purpose: 'PURCHASE',
      currency: 'INR',
      priceList: 'Standard Buying',
      items: [{ item: ITEM, quantity: 4, warehouse: WH, uom: 'EA', rate: 25 }],
      grandTotal: 100,
    });
    expect(await accountMovement('purchase-expenses', pi.code)).toBe(100);
    expect(await accountMovement('stock-received-not-billed', pi.code)).toBe(0);
  });

  it('issuing stock moves value out of Stock In Hand at the moving-average rate', async () => {
    await submit('purchase-receipt', receipt(40, 25)); // 40 @ ₹25

    const se = await submit('stock-entry', {
      date: '2026-08-03',
      stockEntryType: 'Material Issue',
      company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 10, sourceWarehouse: WH, uom: 'EA' }],
    });

    // the issue named no rate — ₹250 is the valuation the ledger worked out (10 × 25)
    expect(await glLines(se.code)).toEqual([
      ['stock-adjustment', 250, 0],
      ['stock-in-hand', 0, 250],
    ]);
  });

  it('a warehouse transfer posts nothing — moving goods is not earning or losing money', async () => {
    await submit('purchase-receipt', receipt(40, 25));

    const se = await submit('stock-entry', {
      date: '2026-08-04',
      stockEntryType: 'Material Transfer',
      company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 15, sourceWarehouse: WH, targetWarehouse: WH2, uom: 'EA' }],
    });

    expect(await glLines(se.code)).toEqual([]);
  });

  // Reconciliation is a whole-company figure and this database is shared with other
  // specs and dev data, so these assert the CHANGE this spec caused, not an absolute.
  it('receipts and issues leave the stock ledger and Stock In Hand no further apart', async () => {
    const before = Number((await stockReportService.reconciliation()).difference);

    await submit('purchase-receipt', receipt(40, 25));
    await submit('stock-entry', {
      date: '2026-08-05',
      stockEntryType: 'Material Issue',
      company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 10, sourceWarehouse: WH, uom: 'EA' }],
    });

    const after = await stockReportService.reconciliation();
    expect(Number(after.difference)).toBe(before); // every movement took its GL entry with it
  });

  it('reconciliation names the voucher when a movement bypassed the GL', async () => {
    const before = Number((await stockReportService.reconciliation()).difference);
    const pr = await submit('purchase-receipt', receipt(40, 25));

    // Simulate the drift perpetual inventory exists to catch: stock moved, books did not.
    // The GL is append-only, so this needs the guard lifted — which is the point: nothing
    // in the application can do this, only a hand-edit of the database.
    await AppDataSource.query('ALTER TABLE gl_entry DISABLE TRIGGER gl_entry_no_update_delete');
    await AppDataSource.query(`DELETE FROM gl_entry WHERE voucher_no = $1`, [pr.code]);
    await AppDataSource.query('ALTER TABLE gl_entry ENABLE TRIGGER gl_entry_no_update_delete');

    const after = await stockReportService.reconciliation();
    expect(after.inSync).toBe(false);
    expect(Number(after.difference) - before).toBe(1000); // stock ledger is ₹1,000 ahead
    expect(after.unpostedVouchers).toContainEqual(
      expect.objectContaining({ voucherType: 'purchase-receipt', voucherNo: pr.code }),
    );
  });
});
