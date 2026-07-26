import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { formsSeeder } from '../../db/seeds/seeders/forms.seeder.js';
import { mastersSeeder } from '../../db/seeds/seeders/masters.seeder.js';
import { namingSeriesSeeder } from '../../db/seeds/seeders/naming-series.seeder.js';
import { registerFormControllers } from '../form-logic/index.js';
import { masterService } from '../master/index.js';
import { stockLedgerService } from './stock-ledger.service.js';

const ITEM = 'ITM-1002';
const A = 'Main Store';
const B = 'Finished Goods';

async function wipeItemLedger(): Promise<void> {
  await AppDataSource.query('ALTER TABLE stock_ledger_entry DISABLE TRIGGER sle_no_update_delete');
  await AppDataSource.query(`DELETE FROM stock_ledger_entry WHERE item_code = $1`, [ITEM]);
  await AppDataSource.query('ALTER TABLE stock_ledger_entry ENABLE TRIGGER sle_no_update_delete');
}

const entry = (type: string, items: Record<string, unknown>[]) => ({
  date: '2026-08-05', stockEntryType: type, company: 'IQ-SMART', items,
});

describe('stock entry — receipt / issue / transfer (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await formsSeeder.run();
    await mastersSeeder.run();
    await namingSeriesSeeder.run();
    registerFormControllers();
  });

  beforeEach(wipeItemLedger);
  afterAll(async () => {
    await wipeItemLedger();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('Material Receipt brings stock in at the given rate', async () => {
    await masterService.createData('stock-entry', entry('Material Receipt', [
      { item: ITEM, quantity: 50, targetWarehouse: A, uom: 'EA', rate: 20 },
    ]));
    const b = await stockLedgerService.balance(ITEM, A);
    expect(b.qty.toNumber()).toBe(50);
    expect(b.valuationRate.toNumber()).toBe(20);
  });

  it('Material Issue takes stock out at the running rate', async () => {
    await masterService.createData('stock-entry', entry('Material Receipt', [
      { item: ITEM, quantity: 50, targetWarehouse: A, uom: 'EA', rate: 20 },
    ]));
    await masterService.createData('stock-entry', entry('Material Issue', [
      { item: ITEM, quantity: 15, sourceWarehouse: A, uom: 'EA' },
    ]));
    const b = await stockLedgerService.balance(ITEM, A);
    expect(b.qty.toNumber()).toBe(35);
    expect(b.valuationRate.toNumber()).toBe(20); // issue never changes the rate
    expect(b.stockValue.toNumber()).toBe(700);
  });

  it('Material Transfer moves qty AND value without creating either', async () => {
    await masterService.createData('stock-entry', entry('Material Receipt', [
      { item: ITEM, quantity: 100, targetWarehouse: A, uom: 'EA', rate: 20 },
    ]));
    await masterService.createData('stock-entry', entry('Material Transfer', [
      { item: ITEM, quantity: 30, sourceWarehouse: A, targetWarehouse: B, uom: 'EA' },
    ]));

    const a = await stockLedgerService.balance(ITEM, A);
    const b = await stockLedgerService.balance(ITEM, B);
    expect(a.qty.toNumber()).toBe(70);
    expect(b.qty.toNumber()).toBe(30);
    expect(b.valuationRate.toNumber()).toBe(20); // received at the source's rate

    // total value across warehouses is unchanged by the move
    expect(a.stockValue.plus(b.stockValue).toNumber()).toBe(2000);
    const net = await AppDataSource.query(
      `SELECT COALESCE(SUM(stock_value_difference),0)::float AS n FROM stock_ledger_entry WHERE item_code=$1`,
      [ITEM],
    );
    expect(Number(net[0].n)).toBe(2000); // only the receipt added value
  });

  it('transferring ALL of a warehouse still values the target at the real rate, not zero', async () => {
    // The rate the target inherits is read before the source is emptied and inside the
    // post lock. Moving the whole balance out must not leave the target valued at the
    // zero rate an emptied source would otherwise report.
    await masterService.createData('stock-entry', entry('Material Receipt', [
      { item: ITEM, quantity: 50, targetWarehouse: A, uom: 'EA', rate: 20 },
    ]));
    await masterService.createData('stock-entry', entry('Material Transfer', [
      { item: ITEM, quantity: 50, sourceWarehouse: A, targetWarehouse: B, uom: 'EA' },
    ]));

    const a = await stockLedgerService.balance(ITEM, A);
    const b = await stockLedgerService.balance(ITEM, B);
    expect(a.qty.toNumber()).toBe(0);
    expect(b.qty.toNumber()).toBe(50);
    expect(b.valuationRate.toNumber()).toBe(20); // NOT 0
    expect(b.stockValue.toNumber()).toBe(1000);

    const net = await AppDataSource.query(
      `SELECT COALESCE(SUM(stock_value_difference),0)::float AS n FROM stock_ledger_entry WHERE item_code=$1`,
      [ITEM],
    );
    expect(Number(net[0].n)).toBe(1000); // the transfer created no value
  });

  it('rejects the warehouse combinations each purpose forbids', async () => {
    await expect(
      masterService.createData('stock-entry', entry('Material Receipt', [
        { item: ITEM, quantity: 5, sourceWarehouse: A, rate: 10 },
      ])),
    ).rejects.toThrow(/target warehouse/i);

    await expect(
      masterService.createData('stock-entry', entry('Material Issue', [
        { item: ITEM, quantity: 5, targetWarehouse: A },
      ])),
    ).rejects.toThrow(/source warehouse/i);

    await expect(
      masterService.createData('stock-entry', entry('Material Transfer', [
        { item: ITEM, quantity: 5, sourceWarehouse: A, targetWarehouse: A },
      ])),
    ).rejects.toThrow(/must differ/i);
  });

  it('cannot issue more than is on hand', async () => {
    await masterService.createData('stock-entry', entry('Material Receipt', [
      { item: ITEM, quantity: 5, targetWarehouse: A, uom: 'EA', rate: 20 },
    ]));
    await expect(
      masterService.createData('stock-entry', entry('Material Issue', [
        { item: ITEM, quantity: 9, sourceWarehouse: A },
      ])),
    ).rejects.toThrow(/insufficient stock/i);
    expect((await stockLedgerService.balance(ITEM, A)).qty.toNumber()).toBe(5); // rolled back
  });
});
