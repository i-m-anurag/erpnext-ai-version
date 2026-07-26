import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { stockLedgerService } from './stock-ledger.service.js';

/**
 * Stock ledger core: moving-average valuation and the three guards that let us skip
 * ERPNext's reposting engine (no back-dating, no negative stock, period freeze).
 *
 * Uses a test-only item so it never collides with seeded data. stock_ledger_entry is
 * append-only, so cleanup lifts the trigger the same controlled way the ledger reset
 * does — leaving no residue between runs.
 */
const ITEM = '__IT_STOCK_ITEM';
const WH = 'Main Store';
const WH2 = 'Finished Goods';
let n = 0;
const voucher = (): string => `__ITSTK-${Date.now()}-${++n}`;

async function wipeTestEntries(): Promise<void> {
  await AppDataSource.query('ALTER TABLE stock_ledger_entry DISABLE TRIGGER sle_no_update_delete');
  await AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]);
  await AppDataSource.query('ALTER TABLE stock_ledger_entry ENABLE TRIGGER sle_no_update_delete');
}

describe('stock ledger (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
  });

  beforeEach(wipeTestEntries);

  afterAll(async () => {
    await wipeTestEntries();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('receives stock and sets the running balance + valuation', async () => {
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 50 }],
    });
    const b = await stockLedgerService.balance(ITEM, WH);
    expect(b.qty.toNumber()).toBe(100);
    expect(b.valuationRate.toNumber()).toBe(50);
    expect(b.stockValue.toNumber()).toBe(5000);
  });

  it('blends the rate on a second receipt (moving average)', async () => {
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 50 }],
    });
    // +100 @ 70  →  (5000 + 7000) / 200 = 60
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-02',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 70 }],
    });
    const b = await stockLedgerService.balance(ITEM, WH);
    expect(b.qty.toNumber()).toBe(200);
    expect(b.valuationRate.toNumber()).toBe(60);
    expect(b.stockValue.toNumber()).toBe(12000);
  });

  it('issues at the running rate, leaving the rate unchanged', async () => {
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 50 }],
    });
    const res = await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-03',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: -30 }],
    });
    const b = await stockLedgerService.balance(ITEM, WH);
    expect(b.qty.toNumber()).toBe(70);
    expect(b.valuationRate.toNumber()).toBe(50); // unchanged by an issue
    expect(b.stockValue.toNumber()).toBe(3500);
    // the value released (what the GL will post) is qty × rate
    expect(Number(res.totalValueDifference)).toBe(-1500);
  });

  it('rejects an issue that would drive stock negative', async () => {
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 10, rate: 50 }],
    });
    await expect(
      stockLedgerService.post({
        voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-02',
        lines: [{ itemCode: ITEM, warehouse: WH, qty: -25 }],
      }),
    ).rejects.toThrow(/insufficient stock/i);
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(10); // unchanged
  });

  it('rejects a back-dated movement (this is what removes the need for reposting)', async () => {
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-10',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 10, rate: 50 }],
    });
    await expect(
      stockLedgerService.post({
        voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
        lines: [{ itemCode: ITEM, warehouse: WH, qty: 5, rate: 60 }],
      }),
    ).rejects.toThrow(/back-dated/i);
  });

  it('keeps warehouses independent and transfers value between them', async () => {
    const v = voucher();
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: v, postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 50 }],
    });
    // transfer 40 out of Main Store into Finished Goods at the outgoing rate
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-02',
      lines: [
        { itemCode: ITEM, warehouse: WH, qty: -40 },
        { itemCode: ITEM, warehouse: WH2, qty: 40, rate: 50 },
      ],
    });
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(60);
    expect((await stockLedgerService.balance(ITEM, WH2)).qty.toNumber()).toBe(40);
    // a pure transfer moves value, it does not create or destroy it
    const rows = await AppDataSource.query(
      `SELECT COALESCE(SUM(stock_value_difference),0)::float AS net FROM stock_ledger_entry WHERE item_code=$1`,
      [ITEM],
    );
    expect(Number(rows[0].net)).toBe(5000); // only the original receipt added value
  });

  it('is idempotent — re-posting the same voucher does not double-count', async () => {
    const v = voucher();
    const first = await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: v, postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 50 }],
    });
    const second = await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: v, postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 100, rate: 50 }],
    });
    expect(first.posted).toBe(true);
    expect(second.posted).toBe(false);
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(100);
  });

  it('rejects a receipt without a rate, and a zero-quantity line', async () => {
    await expect(
      stockLedgerService.post({
        voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
        lines: [{ itemCode: ITEM, warehouse: WH, qty: 10 }],
      }),
    ).rejects.toThrow(/rate greater than zero/i);
    await expect(
      stockLedgerService.post({
        voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
        lines: [{ itemCode: ITEM, warehouse: WH, qty: 0, rate: 5 }],
      }),
    ).rejects.toThrow(/zero quantity/i);
  });

  it('the ledger is append-only — a posted row cannot be updated or deleted', async () => {
    await stockLedgerService.post({
      voucherType: 'stock-entry', voucherNo: voucher(), postingDate: '2026-07-01',
      lines: [{ itemCode: ITEM, warehouse: WH, qty: 5, rate: 10 }],
    });
    await expect(
      AppDataSource.query(`UPDATE stock_ledger_entry SET actual_qty = 999 WHERE item_code = $1`, [ITEM]),
    ).rejects.toThrow(/append-only/i);
    await expect(
      AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]),
    ).rejects.toThrow(/append-only/i);
  });
});
