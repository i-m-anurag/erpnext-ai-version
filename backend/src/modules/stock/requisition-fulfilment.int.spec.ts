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
import { documentCancelService } from '../document/document-cancel.service.js';
import { stockLedgerService } from './stock-ledger.service.js';

/**
 * A Material Request whose purpose is NOT Purchase must lead somewhere. An Issue or
 * Transfer request creates a Stock Entry (not a Purchase Order), that entry moves the
 * stock, and fulfilling it advances the request off "Pending".
 */
const ITEM = 'ITM-9003-REQ';
const WH = 'Main Store';
const WH2 = 'Work In Progress';
const ADMIN = '00000000-0000-0000-0000-000000000001';

async function seedStock(qty: number, rate: number): Promise<void> {
  // Dated well before today, so the issue (which defaults to today) is not back-dated.
  await masterService.createData('stock-entry', {
    date: '2026-01-02', stockEntryType: 'Material Receipt', company: 'IQ-SMART',
    items: [{ item: ITEM, quantity: qty, targetWarehouse: WH, uom: 'EA', rate }],
  });
}

async function wipe(): Promise<void> {
  await AppDataSource.query('ALTER TABLE stock_ledger_entry DISABLE TRIGGER sle_no_update_delete');
  await AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]);
  await AppDataSource.query('ALTER TABLE stock_ledger_entry ENABLE TRIGGER sle_no_update_delete');
}

const request = (type: string) => ({
  materialRequestType: type,
  department: 'Operations',
  items: [{ item: ITEM, qty: 12 }],
});

describe('Material Request fulfilment via Stock Entry (integration)', () => {
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

  beforeEach(wipe);
  afterAll(async () => {
    await wipe();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('offers Stock Entry (not Purchase Order) for a Material Issue request', async () => {
    const req = await masterService.createData('requisition', request('Material Issue'));
    const options = (await documentService.createOptions('requisition', req.code)).map((o) => o.to);
    expect(options).toContain('stock-entry');
    expect(options).not.toContain('purchase-order');
  });

  it('offers Purchase Order (not Stock Entry) for a Purchase request', async () => {
    const req = await masterService.createData('requisition', request('Purchase'));
    const options = (await documentService.createOptions('requisition', req.code)).map((o) => o.to);
    expect(options).toContain('purchase-order');
    expect(options).not.toContain('stock-entry');
  });

  it('carries the type and lines into the Stock Entry draft', async () => {
    const req = await masterService.createData('requisition', request('Material Transfer'));
    const next = await documentService.createNext('requisition', req.code, 'stock-entry', ADMIN);
    const se = await documentDataService.getByCode('stock-entry', next.code);

    expect(se.data['stockEntryType']).toBe('Material Transfer'); // materialRequestType → stockEntryType
    const items = se.data['items'] as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]!['item']).toBe(ITEM);
    expect(Number(items[0]!['quantity'])).toBe(12); // qty → quantity
    expect(se.status).toBe('draft'); // warehouses are filled in before submit
  });

  it('refuses to create a Stock Entry from a Purchase request', async () => {
    const req = await masterService.createData('requisition', request('Purchase'));
    await expect(documentService.createNext('requisition', req.code, 'stock-entry', ADMIN)).rejects.toThrow(
      /does not qualify/i,
    );
  });

  it('fulfilling an Issue request moves the stock and advances the request to Issued', async () => {
    await seedStock(50, 20);
    const req = await masterService.createData('requisition', request('Material Issue'));
    expect(req.state).toBe('Pending');

    // create the draft Stock Entry from the request, fill the source warehouse, submit
    const next = await documentService.createNext('requisition', req.code, 'stock-entry', ADMIN);
    const draft = await documentDataService.getByCode('stock-entry', next.code);
    const se = await masterService.updateData('stock-entry', draft.id, {
      ...draft.data,
      company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 12, sourceWarehouse: WH, uom: 'EA' }],
    });
    expect(se.state).not.toBe('draft');

    // the stock actually left the warehouse
    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(38);

    // and the request is no longer Pending — its issued qty now covers the request
    const after = await documentDataService.getByCode('requisition', req.code);
    expect(after.state).toBe('Issued');
    expect(Number((after.data['items'] as Record<string, unknown>[])[0]!['issuedQty'])).toBe(12);
  });

  it('cancelling the fulfilling Stock Entry gives the quantity back and reopens the request', async () => {
    await seedStock(50, 20);
    const req = await masterService.createData('requisition', request('Material Issue'));
    const next = await documentService.createNext('requisition', req.code, 'stock-entry', ADMIN);
    const draft = await documentDataService.getByCode('stock-entry', next.code);
    const se = await masterService.updateData('stock-entry', draft.id, {
      ...draft.data, company: 'IQ-SMART',
      items: [{ item: ITEM, quantity: 12, sourceWarehouse: WH, uom: 'EA' }],
    });
    expect((await documentDataService.getByCode('requisition', req.code)).state).toBe('Issued');

    // cancel the Stock Entry — stock returns AND the request drops back to Pending
    await documentCancelService.cancel('stock-entry', se.code, '2026-07-27');

    expect((await stockLedgerService.balance(ITEM, WH)).qty.toNumber()).toBe(50); // 38 → 50 again
    const reopened = await documentDataService.getByCode('requisition', req.code);
    expect(reopened.state).toBe('Pending');
    expect(Number((reopened.data['items'] as Record<string, unknown>[])[0]!['issuedQty'])).toBe(0);
  });
});
