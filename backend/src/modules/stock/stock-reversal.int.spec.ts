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
import { documentCancelService } from '../document/document-cancel.service.js';
import { stockLedgerService } from './stock-ledger.service.js';
import { stockReportService } from './stock-report.service.js';

/**
 * Cancelling a document that moved stock.
 *
 * The failure this guards against is silent: reverse a receipt's accounting but leave
 * its goods on the shelf, and Stock In Hand disagrees with the warehouse with nothing
 * to show for it. Every test here asserts that BOTH ledgers moved, or neither did.
 */
const ITEM = 'ITM-9002-REV';
const WH = 'Main Store';
const WH2 = 'Work In Progress';
const REV_DATE = '2026-09-01';

const created: string[] = [];

async function wipeFixture(): Promise<void> {
  await AppDataSource.query('ALTER TABLE stock_ledger_entry DISABLE TRIGGER sle_no_update_delete');
  await AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]);
  await AppDataSource.query('ALTER TABLE stock_ledger_entry ENABLE TRIGGER sle_no_update_delete');

  if (created.length > 0) {
    const withReversals = created.flatMap((c) => [c, `${c}-REV`]);
    await AppDataSource.query('ALTER TABLE gl_entry DISABLE TRIGGER gl_entry_no_update_delete');
    await AppDataSource.query(`DELETE FROM gl_entry WHERE voucher_no = ANY($1)`, [withReversals]);
    await AppDataSource.query('ALTER TABLE gl_entry ENABLE TRIGGER gl_entry_no_update_delete');
    created.length = 0;
  }
}

async function submit(slug: string, data: Record<string, unknown>): Promise<{ code: string }> {
  const row = await masterService.createData(slug, data);
  created.push(row.code);
  return row;
}

const receipt = (qty: number, rate: number, date = '2026-08-01') => ({
  date,
  supplier: 'Acme Supplies',
  company: 'IQ-SMART',
  items: [{ item: ITEM, quantity: qty, warehouse: WH, uom: 'EA', rate }],
});

/** Net movement on one account across a voucher and its reversal. */
async function accountNet(account: string, voucherNos: string[]): Promise<number> {
  const [r] = (await AppDataSource.query(
    `SELECT COALESCE(SUM(debit - credit), 0) AS net FROM gl_entry WHERE account = $1 AND voucher_no = ANY($2)`,
    [account, voucherNos],
  )) as { net: string }[];
  return Number(r?.net ?? 0);
}

describe('cancelling a stock document (integration)', () => {
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

  it('takes the goods back off the shelf, not just the money out of the books', async () => {
    const pr = await submit('purchase-receipt', receipt(40, 25));
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(40);

    await documentCancelService.cancel('purchase-receipt', pr.code, REV_DATE);

    // the regression this exists for: stock must go too
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(0);
    expect(await accountNet('stock-in-hand', [pr.code, `${pr.code}-REV`])).toBe(0);
    expect(await accountNet('stock-received-not-billed', [pr.code, `${pr.code}-REV`])).toBe(0);
  });

  it('reverses the value that was posted, not the value the average has since become', async () => {
    // 40 @ ₹25 then 40 @ ₹35 → 80 units, ₹2,400, average ₹30
    const first = await submit('purchase-receipt', receipt(40, 25, '2026-08-01'));
    await submit('purchase-receipt', receipt(40, 35, '2026-08-02'));
    expect((await stockLedgerService.balance(ITEM, WH)).valuationRate.toNumber()).toBe(30);

    await documentCancelService.cancel('purchase-receipt', first.code, REV_DATE);

    // ₹1,000 goes back out — NOT 40 × the ₹30 average. What is left is the second
    // receipt, correctly valued at its own ₹35.
    const after = await stockLedgerService.balance(ITEM, WH);
    expect(after.qty.toNumber()).toBe(40);
    expect(after.stockValue.toNumber()).toBe(1400);
    expect(after.valuationRate.toNumber()).toBe(35);
    expect(await accountNet('stock-in-hand', [first.code, `${first.code}-REV`])).toBe(0);
  });

  it('refuses to un-receive goods that have already been issued, and posts nothing', async () => {
    const pr = await submit('purchase-receipt', receipt(40, 25));
    await submit('stock-entry', {
      date: '2026-08-03',
      stockEntryType: 'Material Issue',
      company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 30, sourceWarehouse: WH, uom: 'EA' }],
    });

    await expect(documentCancelService.cancel('purchase-receipt', pr.code, REV_DATE)).rejects.toThrow(
      /stock has already moved on/i,
    );

    // the whole cancellation rolled back — the GL was not half-reversed
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(10);
    expect(await accountNet('stock-in-hand', [`${pr.code}-REV`])).toBe(0);
  });

  it('cancels a transfer, which has stock entries but no accounting to reverse', async () => {
    await submit('purchase-receipt', receipt(40, 25));
    const se = await submit('stock-entry', {
      date: '2026-08-04',
      stockEntryType: 'Material Transfer',
      company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 15, sourceWarehouse: WH, targetWarehouse: WH2, uom: 'EA' }],
    });
    expect((await stockLedgerService.balance(ITEM, WH2)).qty.toNumber()).toBe(15);

    const res = await documentCancelService.cancel('stock-entry', se.code, REV_DATE);
    expect(res.reversedStock).toBe(true);
    expect(res.reversedGl).toBe(false); // a transfer posted no GL, so there is none to undo

    expect((await stockLedgerService.balance(ITEM, WH2)).qty.toNumber()).toBe(0);
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(40);
  });

  it('cancelling twice reverses once', async () => {
    const pr = await submit('purchase-receipt', receipt(40, 25));
    await documentCancelService.cancel('purchase-receipt', pr.code, REV_DATE);
    const second = await documentCancelService.cancel('purchase-receipt', pr.code, REV_DATE);

    expect(second.posted).toBe(false);
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(0); // not −40
  });

  it('refuses a document that posted nothing at all', async () => {
    await expect(documentCancelService.cancel('purchase-receipt', 'PR-DOES-NOT-EXIST', REV_DATE)).rejects.toThrow(
      /nothing to reverse/i,
    );
  });

  it('leaves the stock ledger and the books no further apart than it found them', async () => {
    const before = Number((await stockReportService.reconciliation()).difference);
    const pr = await submit('purchase-receipt', receipt(40, 25));
    await documentCancelService.cancel('purchase-receipt', pr.code, REV_DATE);

    const after = await stockReportService.reconciliation();
    expect(Number(after.difference)).toBe(before);
  });
});
