import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { formsSeeder } from '../../db/seeds/seeders/forms.seeder.js';
import { mastersSeeder } from '../../db/seeds/seeders/masters.seeder.js';
import { namingSeriesSeeder } from '../../db/seeds/seeders/naming-series.seeder.js';
import { accountsSeeder } from '../../db/seeds/seeders/accounts.seeder.js';
import { registerFormControllers } from '../form-logic/index.js';
import { registerPostingRules } from './register-posting-rules.js';
import { masterService } from '../master/index.js';
import { documentDataService } from '../document/document-data.service.js';
import { ledgerService } from './index.js';

/**
 * A financial document (Purchase Invoice) persists AND posts to the ledger inside a
 * single transaction: if the GL post fails, the document must roll back too — never a
 * saved-but-unposted "ghost" document. We prove the rollback by forcing post() to
 * throw AFTER the document row has been inserted in the transaction.
 *
 * The input satisfies every required field of the canonical Purchase Invoice form.
 */
const PI = 'purchase-invoice';
const POSTING_DATE = '2027-06-15';
const validInput = () => ({
  date: POSTING_DATE,
  supplier: 'Acme Supplies',
  purpose: 'PURCHASE',
  company: 'IQ-SMART',
  currency: 'INR',
  priceList: 'Standard Buying',
  items: [{ item: 'ITM-1001', quantity: 2, warehouse: 'Main Store', uom: 'EA', rate: 1500 }],
});

async function countPis(): Promise<number> {
  return (await documentDataService.list(PI, 500)).length;
}

describe('document + ledger posting atomicity (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await formsSeeder.run();
    await mastersSeeder.run();
    await namingSeriesSeeder.run();
    await accountsSeeder.run();
    registerFormControllers();
    registerPostingRules();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('rolls the document back when the GL post throws (no ghost document)', async () => {
    const before = await countPis();
    const spy = vi.spyOn(ledgerService, 'post').mockRejectedValueOnce(new Error('boom: simulated GL failure'));

    await expect(masterService.createData(PI, validInput())).rejects.toThrow(/boom/);

    spy.mockRestore();
    const after = await countPis();
    // The invoice row was rolled back together with the failed post — no residue, so
    // this test is repeatable. (The success path — document + balanced GL committed
    // together — is verified live against the API, since the append-only ledger can't
    // be cleaned up after a real post.)
    expect(after).toBe(before);
  });
});
