import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { formsSeeder } from '../../db/seeds/seeders/forms.seeder.js';
import { mastersSeeder } from '../../db/seeds/seeders/masters.seeder.js';
import { formService } from '../form/index.js';
import { masterService, MasterData } from './index.js';

const CAT = '__it_cat';
const SKU = '__IT_SKU';

describe('master-data store (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await formsSeeder.run();
    await mastersSeeder.run();
    const repo = AppDataSource.getRepository(MasterData);
    await repo.delete({ masterSlug: 'vendor-category', code: CAT });
    await repo.delete({ masterSlug: 'item', code: SKU });
  });

  afterAll(async () => {
    const repo = AppDataSource.getRepository(MasterData);
    await repo.delete({ masterSlug: 'vendor-category', code: CAT });
    await repo.delete({ masterSlug: 'item', code: SKU });
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('returns seeded options (value=code, label=labelField), cached', async () => {
    const countries = await masterService.getOptions('country');
    expect(countries.length).toBeGreaterThanOrEqual(4);
    expect(countries.find((o) => o.value === 'IN')).toEqual({ value: 'IN', label: 'India' });
  });

  it('rejects writes to a seeded (read-only) master', async () => {
    await expect(masterService.createData('country', { code: 'XX', name: 'X' })).rejects.toThrow(/read-only/);
  });

  it('creates a row validated against the master form and reflects it in options', async () => {
    const row = await masterService.createData('vendor-category', { code: CAT, name: 'IT Category' });
    expect(row.code).toBe(CAT);
    const opts = await masterService.getOptions('vendor-category');
    expect(opts.some((o) => o.value === CAT)).toBe(true);
  });

  it('enforces required fields and uniqueness', async () => {
    await expect(masterService.createData('vendor-category', { name: 'no code' })).rejects.toThrow(/required|Validation/);
    await expect(masterService.createData('vendor-category', { code: CAT, name: 'dup' })).rejects.toThrow(/already exists/);
  });

  it('uses a custom codeField (sku) for the item master', async () => {
    const item = await masterService.createData('item', { sku: SKU, name: 'IT Item', uom: 'EA' });
    expect(item.code).toBe(SKU);
  });

  it('resolves a form definition via the form service', async () => {
    const form = await formService.getForm('master-item');
    expect(form.definition.title).toBe('Item');
  });
});
