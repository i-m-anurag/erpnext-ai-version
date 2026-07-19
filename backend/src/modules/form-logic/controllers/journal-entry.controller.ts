import { ledgerService } from '../../ledger/index.js';
import { BadRequestError } from '../../../shared/errors.js';
import type { FormController } from '../form-controller.js';

/** Today as an ISO date (yyyy-mm-dd). */
const today = (): string => new Date().toISOString().slice(0, 10);

interface JeLine {
  account?: string;
  debit?: unknown;
  credit?: unknown;
  party?: string;
  remarks?: string;
}

const linesOf = (v: unknown): JeLine[] => (Array.isArray(v) ? (v as JeLine[]) : []);

/**
 * Journal Entry business logic — the accountant's manual GL posting (opening balances,
 * depreciation, accruals, corrections, bank charges). Unlike Purchase Invoice / Payment
 * Entry there is no derived mapping: the user types the Debit/Credit per line and this
 * posts them verbatim. The ledger enforces that the voucher balances.
 */
export const journalEntryController: FormController = {
  /** Validate the lines and reject a frozen-period posting BEFORE the document is
   *  persisted (so a rejected post can't leave a saved-but-unposted document). */
  async beforeSave(ctx) {
    if (ctx.draft) return;
    const lines = linesOf(ctx.input['lines']);
    if (lines.length < 2) throw new BadRequestError('a journal entry needs at least two lines');
    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      const d = Number(l.debit ?? 0);
      const c = Number(l.credit ?? 0);
      if (d > 0 && c > 0) throw new BadRequestError('a line cannot have both a debit and a credit');
      if (d <= 0 && c <= 0) throw new BadRequestError('each line needs a debit or a credit amount');
      totalDebit += d;
      totalCredit += c;
    }
    if (Math.abs(totalDebit - totalCredit) > 1e-6) {
      throw new BadRequestError(`journal not balanced: total debit ${totalDebit} ≠ total credit ${totalCredit}`);
    }
    await ledgerService.assertNotFrozen((ctx.input['postingDate'] as string | undefined) ?? today());
  },

  /** Post the entered lines to the GL, on the document's transaction (atomic). */
  async afterSave(doc, tx) {
    if (doc.status === 'draft') return;
    const lines = linesOf(doc.data['lines']).map((l) => ({
      account: String(l.account),
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
      party: (l.party as string | undefined) || null,
      remarks: (l.remarks as string | undefined) || null,
    }));
    const postingDate = (doc.data['postingDate'] as string | undefined) ?? today();
    await ledgerService.post({ voucherType: doc.slug, voucherNo: doc.code, postingDate, lines }, tx?.manager);
  },
};
