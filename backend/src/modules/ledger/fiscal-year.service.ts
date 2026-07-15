import { Decimal } from 'decimal.js';
import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { FiscalYear } from './fiscal-year.entity.js';
import { ledgerService, type PostingLine } from './ledger.service.js';
import { ledgerSettingsService } from './ledger-settings.service.js';

export interface FiscalYearDef {
  name: string;
  startDate: string;
  endDate: string;
  isDefault?: boolean;
}

const RETAINED = 'retained-earnings';

/** Fiscal years + year-end closing. */
export class FiscalYearService {
  private readonly repo = new BaseRepository(FiscalYear);

  async list(): Promise<FiscalYear[]> {
    return this.repo.find({ order: { startDate: 'ASC' } });
  }

  /** The latest closed year's end date (postings up to here are in a closed period). */
  async lastCloseDate(): Promise<string | null> {
    const rows = await this.repo.find({ where: { closed: true }, order: { endDate: 'DESC' }, take: 1 });
    return rows[0]?.endDate ?? null;
  }

  /** Idempotent upsert (for the seeder). */
  async seed(defs: FiscalYearDef[]): Promise<number> {
    let changed = 0;
    for (const d of defs) {
      const existing = await this.repo.findOne({ name: d.name });
      if (existing) continue; // never disturb a seeded year (may be closed)
      await this.repo.save(this.repo.create({ name: d.name, startDate: d.startDate, endDate: d.endDate, isDefault: d.isDefault ?? false, closed: false }));
      changed++;
    }
    return changed;
  }

  /**
   * Close a fiscal year: post a balanced closing voucher that zeroes the year's
   * income/expense into Retained Earnings, mark the year closed, and freeze postings
   * up to its end date. Idempotent — a closed year is a no-op.
   */
  async close(id: string): Promise<{ closed: boolean; netProfit: string; voucher: string }> {
    const fy = await this.repo.findOne({ id });
    if (!fy) throw new NotFoundError('fiscal year not found');
    const voucher = `CLOSE-${fy.name}`;
    if (fy.closed) return { closed: false, netProfit: '0.00', voucher };

    // Income/expense balances within the year (excluding any prior closing entries).
    const rows = (await AppDataSource.query(
      `SELECT a.code, a.root_type, SUM(g.debit) AS d, SUM(g.credit) AS c
         FROM account a JOIN gl_entry g ON g.account = a.code
        WHERE a.root_type IN ('Income','Expense')
          AND g.voucher_type <> 'period-closing'
          AND g.posting_date::date BETWEEN $1 AND $2
        GROUP BY a.code, a.root_type`,
      [fy.startDate, fy.endDate],
    )) as Record<string, unknown>[];

    const lines: PostingLine[] = [];
    let net = new Decimal(0); // + = profit
    for (const r of rows) {
      const d = new Decimal(String(r.d));
      const c = new Decimal(String(r.c));
      if (r.root_type === 'Income') {
        const bal = c.minus(d); // income is credit-natured
        if (!bal.isZero()) { lines.push({ account: String(r.code), debit: bal.toNumber(), credit: 0 }); net = net.plus(bal); }
      } else {
        const bal = d.minus(c); // expense is debit-natured
        if (!bal.isZero()) { lines.push({ account: String(r.code), debit: 0, credit: bal.toNumber() }); net = net.minus(bal); }
      }
    }
    if (lines.length === 0) throw new BadRequestError('nothing to close — no income or expense in this year');

    // Balancing line: net profit → Retained Earnings (credit); a loss debits it.
    if (net.gt(0)) lines.push({ account: RETAINED, debit: 0, credit: net.toNumber() });
    else lines.push({ account: RETAINED, debit: net.abs().toNumber(), credit: 0 });

    await ledgerService.post({ voucherType: 'period-closing', voucherNo: voucher, postingDate: fy.endDate, lines });

    fy.closed = true;
    await this.repo.save(fy);
    await ledgerSettingsService.set(fy.endDate); // lock the closed period

    return { closed: true, netProfit: net.toFixed(2), voucher };
  }
}

export const fiscalYearService = new FiscalYearService();
