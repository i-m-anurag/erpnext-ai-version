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
import { masterService } from '../master/index.js';
import { documentDataService } from '../document/document-data.service.js';
import { ledgerService } from './index.js';

/**
 * Journal Entry — the accountant's manual GL posting. It posts the entered Debit/Credit
 * lines verbatim, atomically with the document, and must reject an unbalanced entry.
 */
const JE = 'journal-entry';
const today = new Date().toISOString().slice(0, 10);
const balanced = () => ({
  postingDate: today,
  narration: 'itspec balanced',
  lines: [
    { account: 'cash', debit: 1000, credit: 0 },
    { account: 'bank', debit: 0, credit: 1000 },
  ],
});

async function countJEs(): Promise<number> {
  return (await documentDataService.list(JE, 500)).length;
}

describe('journal entry posting (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await formsSeeder.run();
    await mastersSeeder.run();
    await namingSeriesSeeder.run();
    await accountsSeeder.run();
    registerFormControllers();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('rejects an unbalanced journal (debits ≠ credits) with no document saved', async () => {
    const before = await countJEs();
    const unbalanced = { postingDate: today, lines: [
      { account: 'cash', debit: 1000, credit: 0 },
      { account: 'bank', debit: 0, credit: 900 },
    ] };
    await expect(masterService.createData(JE, unbalanced)).rejects.toThrow(/not balanced/i);
    expect(await countJEs()).toBe(before); // rejected in beforeSave — nothing persisted
  });

  it('rolls the document back when the GL post throws (atomic, no ghost)', async () => {
    const before = await countJEs();
    const spy = vi.spyOn(ledgerService, 'post').mockRejectedValueOnce(new Error('boom: simulated GL failure'));
    await expect(masterService.createData(JE, balanced())).rejects.toThrow(/boom/);
    spy.mockRestore();
    expect(await countJEs()).toBe(before);
  });
});
