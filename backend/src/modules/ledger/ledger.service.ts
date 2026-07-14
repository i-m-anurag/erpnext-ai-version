import { Decimal } from 'decimal.js';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../db/data-source.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { BadRequestError } from '../../shared/errors.js';
import { GlEntry } from './gl-entry.entity.js';
import { ledgerSettingsService } from './ledger-settings.service.js';

/** One side of a posting. Exactly one of debit/credit should be non-zero. */
export interface PostingLine {
  account: string;
  debit?: number | string;
  credit?: number | string;
  party?: string | null;
  remarks?: string | null;
}

export interface Voucher {
  voucherType: string;
  voucherNo: string;
  postingDate: Date | string;
  lines: PostingLine[];
}

const d = (v: number | string | undefined): Decimal => new Decimal(v ?? 0);

/** The "against" summary for a line = the accounts on the opposite side. */
function againstFor(line: PostingLine, lines: PostingLine[]): string {
  const isDebit = d(line.debit).gt(0);
  const opposite = lines.filter((l) => (isDebit ? d(l.credit) : d(l.debit)).gt(0)).map((l) => l.account);
  return [...new Set(opposite)].join(', ') || '';
}

/**
 * The financial-ledger posting engine. `post()` writes a balanced voucher to the
 * append-only `gl_entry` (atomic + idempotent by voucher); `reverse()` posts the
 * opposite entries (corrections never edit — they reverse). Money uses decimal.js
 * over NUMERIC(21,6) so sums are exact.
 */
export class LedgerService {
  private readonly repo = new BaseRepository(GlEntry);

  async post(v: Voucher): Promise<{ posted: boolean; lines: number }> {
    if (v.lines.length === 0) throw new BadRequestError('a voucher needs at least one line');

    let dr = new Decimal(0);
    let cr = new Decimal(0);
    for (const l of v.lines) {
      dr = dr.plus(d(l.debit));
      cr = cr.plus(d(l.credit));
    }
    if (dr.isZero() && cr.isZero()) throw new BadRequestError('voucher has zero value');
    if (!dr.equals(cr)) throw new BadRequestError(`voucher not balanced: debit ${dr} ≠ credit ${cr}`);

    // Period freeze: reject postings on or before the lock date.
    const freeze = await ledgerSettingsService.freezeDate();
    if (freeze && new Date(v.postingDate) <= freeze) {
      throw new BadRequestError(`posting date is in a frozen period (on/before ${freeze.toISOString().slice(0, 10)})`);
    }

    return AppDataSource.transaction(async (mgr: EntityManager) => {
      // Idempotency: a voucher already in the ledger is never posted twice.
      const seen = (await mgr.query(
        `SELECT 1 FROM gl_entry WHERE voucher_type=$1 AND voucher_no=$2 LIMIT 1`,
        [v.voucherType, v.voucherNo],
      )) as unknown[];
      if (seen.length > 0) return { posted: false, lines: 0 };

      for (const l of v.lines) {
        await mgr.query(
          `INSERT INTO gl_entry
             (posting_date, account, debit, credit, voucher_type, voucher_no, party, against, remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            v.postingDate,
            l.account,
            d(l.debit).toFixed(6),
            d(l.credit).toFixed(6),
            v.voucherType,
            v.voucherNo,
            l.party ?? null,
            againstFor(l, v.lines),
            l.remarks ?? null,
          ],
        );
      }
      return { posted: true, lines: v.lines.length };
    });
  }

  /** Reverse a posted voucher by posting equal-and-opposite entries under `<no>-REV`. */
  async reverse(voucherType: string, voucherNo: string, postingDate: Date | string): Promise<{ posted: boolean }> {
    const rows = await this.repo.find({ where: { voucherType, voucherNo } });
    if (rows.length === 0) throw new BadRequestError(`nothing to reverse for ${voucherType} ${voucherNo}`);
    const lines: PostingLine[] = rows.map((r) => ({
      account: r.account,
      debit: r.credit, // swap
      credit: r.debit,
      party: r.party,
      remarks: `Reversal of ${voucherNo}`,
    }));
    const res = await this.post({ voucherType, voucherNo: `${voucherNo}-REV`, postingDate, lines });
    return { posted: res.posted };
  }

  /** The GL lines for one voucher (used by the "Accounting Entries" panel). */
  async forVoucher(voucherType: string, voucherNo: string): Promise<GlEntry[]> {
    return this.repo.find({ where: { voucherType, voucherNo }, order: { seq: 'ASC' } });
  }
}

export const ledgerService = new LedgerService();
