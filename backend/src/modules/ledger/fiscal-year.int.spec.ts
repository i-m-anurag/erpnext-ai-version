import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { FiscalYear } from './fiscal-year.entity.js';
import { fiscalYearService } from './fiscal-year.service.js';
import { ledgerService } from './ledger.service.js';
import { ledgerSettingsService } from './ledger-settings.service.js';

/**
 * Year-end close guards. #1 (not-yet-ended) and #5 (chronological order) are pure
 * rejection paths that mutate nothing, so we exercise them with real fiscal_year rows
 * (which are deletable). #6 (freeze only advances) needs a SUCCESSFUL close, which
 * would post an append-only closing voucher and move the global freeze — so we mock
 * the ledger/settings dependencies and assert only the advance-or-not decision.
 */
const NAMES = ['__IT_FY_FUTURE', '__IT_FY_EARLY', '__IT_FY_LATER'];

describe('fiscal-year close guards (integration)', () => {
  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await AppDataSource.getRepository(FiscalYear).delete({ name: NAMES[0]! });
    await AppDataSource.getRepository(FiscalYear).delete({ name: NAMES[1]! });
    await AppDataSource.getRepository(FiscalYear).delete({ name: NAMES[2]! });
  });

  afterAll(async () => {
    await AppDataSource.destroy();
    await redis.quit();
  });

  const makeFy = (name: string, startDate: string, endDate: string) =>
    AppDataSource.getRepository(FiscalYear).save(
      AppDataSource.getRepository(FiscalYear).create({ name, startDate, endDate, isDefault: false, closed: false }),
    );

  it('#1 refuses to close a year that has not ended yet', async () => {
    const fy = await makeFy('__IT_FY_FUTURE', '2099-04-01', '2100-03-31');
    await expect(fiscalYearService.close(fy.id)).rejects.toThrow(/future/i);
  });

  it('#5 refuses to close out of order while an earlier year is still open', async () => {
    // Both ended (past today), both open. __IT_FY_EARLY starts first, so closing
    // __IT_FY_LATER must be blocked. Dated in 2019 so these are the earliest open
    // years — the guard is deterministic regardless of the real seeded years.
    await makeFy('__IT_FY_EARLY', '2019-04-01', '2019-12-31');
    const later = await makeFy('__IT_FY_LATER', '2020-01-01', '2020-06-30');
    await expect(fiscalYearService.close(later.id)).rejects.toThrow(/earlier year/i);
  });

  it('#6 advances the freeze on close but never moves it backward', async () => {
    // A closeable year whose range contains real income/expense (so it doesn't short-
    // circuit as "nothing to close"). We mock the DB-mutating steps and assert only
    // how the freeze is (or isn't) advanced.
    const fy: FiscalYear = {
      id: '00000000-0000-0000-0000-0000000000f6', name: '__IT_FY6',
      startDate: '2026-07-01', endDate: '2026-07-10', isDefault: false, closed: false,
    } as FiscalYear;
    const repo = (fiscalYearService as unknown as { repo: { findOne: unknown; find: unknown; save: unknown } }).repo;
    vi.spyOn(repo as { findOne: () => unknown }, 'findOne').mockResolvedValue(fy);
    vi.spyOn(repo as { find: () => unknown }, 'find').mockResolvedValue([fy]); // no earlier open year
    vi.spyOn(repo as { save: () => unknown }, 'save').mockResolvedValue(fy);
    vi.spyOn(ledgerService, 'post').mockResolvedValue({ posted: true, lines: 2 });
    const setSpy = vi.spyOn(ledgerSettingsService, 'set').mockResolvedValue(undefined as never);

    // Freeze already LATER than this year's end → must NOT move backward.
    vi.spyOn(ledgerSettingsService, 'freezeDate').mockResolvedValue(new Date('2030-12-31'));
    await fiscalYearService.close(fy.id);
    expect(setSpy).not.toHaveBeenCalled();

    // Freeze EARLIER than this year's end → must advance to the year end.
    setSpy.mockClear();
    fy.closed = false; // close() flipped it above on the shared mock object
    vi.spyOn(ledgerSettingsService, 'freezeDate').mockResolvedValue(new Date('2020-01-01'));
    await fiscalYearService.close(fy.id);
    expect(setSpy).toHaveBeenCalledWith('2026-07-10');
  });
});
