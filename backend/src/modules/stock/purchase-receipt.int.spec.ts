import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { formsSeeder } from '../../db/seeds/seeders/forms.seeder.js';
import { mastersSeeder } from '../../db/seeds/seeders/masters.seeder.js';
import { namingSeriesSeeder } from '../../db/seeds/seeders/naming-series.seeder.js';
import { pipelinesSeeder } from '../../db/seeds/seeders/pipelines.seeder.js';
import { registerFormControllers } from '../form-logic/index.js';
import { masterService } from '../master/index.js';
import { documentService } from '../document/document.service.js';
import { documentDataService } from '../document/document-data.service.js';
import { stockLedgerService } from './stock-ledger.service.js';

/**
 * Purchase Receipt is the document that brings stock IN, and it sits between the
 * Purchase Order and the Purchase Invoice. This covers both halves:
 *   • the PO → PR pipeline step carries the ordered lines across (translating the
 *     column names, since a PO has `lines[].qty` and a Receipt has `items[].quantity`)
 *   • submitting the Receipt actually moves stock, atomically with the document
 */
const ITEM = 'ITM-1001';
const WH = 'Main Store';
const ADMIN = '00000000-0000-0000-0000-000000000001';

async function wipeItemLedger(): Promise<void> {
  await AppDataSource.query('ALTER TABLE stock_ledger_entry DISABLE TRIGGER sle_no_update_delete');
  await AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]);
  await AppDataSource.query('ALTER TABLE stock_ledger_entry ENABLE TRIGGER sle_no_update_delete');
}

const receiptInput = (qty: number, rate: number) => ({
  date: '2026-08-01',
  supplier: 'Acme Supplies',
  company: 'IQ-SMART',
  purpose: 'PURCHASE',
  currency: 'INR',
  supplierDeliveryNote: 'DN-TEST',
  items: [{ item: ITEM, quantity: qty, warehouse: WH, uom: 'EA', rate }],
});

describe('purchase receipt → stock (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await formsSeeder.run();
    await mastersSeeder.run();
    await namingSeriesSeeder.run();
    await pipelinesSeeder.run();
    registerFormControllers();
  });

  beforeEach(wipeItemLedger);

  afterAll(async () => {
    await wipeItemLedger();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('submitting a receipt moves stock in at the receipt rate', async () => {
    const before = await stockLedgerService.balance(ITEM, WH);
    const pr = await masterService.createData('purchase-receipt', receiptInput(40, 25));

    const after = await stockLedgerService.balance(ITEM, WH);
    expect(after.qty.minus(before.qty).toNumber()).toBe(40);
    expect(after.valuationRate.toNumber()).toBe(25);

    // the movement is traceable back to the receipt, one row per line
    const moves = await stockLedgerService.forVoucher('purchase-receipt', pr.code);
    expect(moves).toHaveLength(1);
    expect(Number(moves[0]!.actual_qty)).toBe(40);
    expect(Number(moves[0]!.stock_value_difference)).toBe(1000); // 40 × 25 → what the GL will post
  });

  it('stocks rejected units into the rejected warehouse, not just the accepted ones', async () => {
    const REJECT_WH = 'Work In Progress';
    const pr = await masterService.createData('purchase-receipt', {
      date: '2026-08-01', supplier: 'Acme Supplies', company: 'IQ-SMART',
      purpose: 'PURCHASE', currency: 'INR', supplierDeliveryNote: 'DN-TEST',
      items: [{ item: ITEM, quantity: 40, rejectedQuantity: 5, warehouse: WH, rejectedWarehouse: REJECT_WH, uom: 'EA', rate: 25 }],
    });

    // accepted into the main warehouse, rejected into its own — both on the books
    const moves = await stockLedgerService.forVoucher('purchase-receipt', pr.code);
    expect(moves).toHaveLength(2);
    const byWh = Object.fromEntries(moves.map((m) => [String(m.warehouse), Number(m.actual_qty)]));
    expect(byWh[WH]).toBe(40);
    expect(byWh[REJECT_WH]).toBe(5);

    // the GL debit covers the FULL received value (45 × 25 = 1,125), not just accepted
    const total = moves.reduce((s, m) => s + Number(m.stock_value_difference), 0);
    expect(total).toBe(1125);
  });

  it('rejects a rejected quantity with no rejected warehouse to put it in', async () => {
    await expect(
      masterService.createData('purchase-receipt', {
        date: '2026-08-01', supplier: 'Acme Supplies', company: 'IQ-SMART',
        purpose: 'PURCHASE', currency: 'INR', supplierDeliveryNote: 'DN-TEST',
        items: [{ item: ITEM, quantity: 40, rejectedQuantity: 5, warehouse: WH, uom: 'EA', rate: 25 }],
      }),
    ).rejects.toThrow(/rejected warehouse/i);
  });

  it('a DRAFT receipt does not move stock', async () => {
    const before = await stockLedgerService.balance(ITEM, WH);
    await masterService.createData('purchase-receipt', receiptInput(10, 25), true); // draft
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(before.qty.toNumber());
  });

  it('rejects a receipt line with no warehouse (stock has nowhere to go)', async () => {
    await expect(
      masterService.createData('purchase-receipt', {
        date: '2026-08-01', supplier: 'Acme Supplies', company: 'IQ-SMART',
        purpose: 'PURCHASE', currency: 'INR', supplierDeliveryNote: 'DN-TEST',
        items: [{ item: ITEM, quantity: 5, rate: 10 }],
      }),
    ).rejects.toThrow(/warehouse/i);
  });

  it('PO → PR pipeline carries the ordered lines across, translating column names', async () => {
    const po = await masterService.createData('purchase-order', {
      vendor: 'Acme Supplies',
      poDate: '2026-08-01',
      lines: [{ item: ITEM, qty: 12, rate: 30, remarks: 'first batch' }],
    });

    // the pipeline must offer the Receipt as the next document
    const options = await documentService.createOptions('purchase-order', po.code);
    expect(options.map((o) => o.to)).toContain('purchase-receipt');

    const next = await documentService.createNext('purchase-order', po.code, 'purchase-receipt', ADMIN);
    const pr = await documentDataService.getByCode('purchase-receipt', next.code);

    expect(pr.data['supplier']).toBe('Acme Supplies');   // vendor → supplier
    expect(pr.data['purchaseOrder']).toBe(po.code);      // lineage reference
    const items = pr.data['items'] as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]!['item']).toBe(ITEM);
    expect(Number(items[0]!['quantity'])).toBe(12);      // lines[].qty → items[].quantity
    expect(Number(items[0]!['rate'])).toBe(30);
    // warehouse is deliberately NOT inherited — it is chosen when receiving
    expect(items[0]!['warehouse']).toBeFalsy();

    // created as a draft, so nothing has moved yet
    expect(pr.status).toBe('draft');
  });
});
