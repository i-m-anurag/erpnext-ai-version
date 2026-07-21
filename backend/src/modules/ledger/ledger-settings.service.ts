import { BaseRepository } from '../../shared/base.repository.js';
import { LedgerSettings } from './ledger-settings.entity.js';

const ID = 'singleton';

/** Ledger settings — currently just the period-freeze (posting lock) date. */
export class LedgerSettingsService {
  private readonly repo = new BaseRepository(LedgerSettings);

  async get(): Promise<{ freezeDate: string | null }> {
    const row = await this.repo.findOne({ id: ID });
    return { freezeDate: row?.freezeDate ? row.freezeDate.toISOString() : null };
  }

  /** The freeze date as a Date, or null. Used by the posting guard. */
  async freezeDate(): Promise<Date | null> {
    const row = await this.repo.findOne({ id: ID });
    return row?.freezeDate ?? null;
  }

  async set(freezeDate: string | null): Promise<{ freezeDate: string | null }> {
    const row = (await this.repo.findOne({ id: ID })) ?? this.repo.create({ id: ID });
    row.freezeDate = freezeDate ? new Date(freezeDate) : null;
    await this.repo.save(row);
    return this.get();
  }
}

export const ledgerSettingsService = new LedgerSettingsService();
