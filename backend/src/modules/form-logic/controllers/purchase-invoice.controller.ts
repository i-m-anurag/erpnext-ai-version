import { ledgerService } from '../../ledger/index.js';
import { buildVoucher, getPostingRule } from '../../ledger/posting-rule.js';
import type { FormController } from '../form-controller.js';

/** Today as an ISO date (yyyy-mm-dd) — the posting date must be a date, not a
 *  timestamp, so it lands in the right day regardless of server timezone. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Purchase Invoice business logic. On submit it auto-posts to the General Ledger
 * via the config-driven posting rule (Dr Purchase Expenses, Cr Creditors) — the
 * form-controller afterSave seam is where documents feed the ledger.
 *
 * `grandTotal` and the other totals are derived by the form's `calculate` expressions
 * (applied server-side on save), so there is no amount arithmetic in here.
 */
export const purchaseInvoiceController: FormController = {
  /** Reject a frozen-period posting BEFORE the document is written, so a rejected
   *  post can't leave a persisted-but-unposted document behind. */
  async beforeSave(ctx) {
    if (!ctx.draft) {
      await ledgerService.assertNotFrozen((ctx.input['date'] as string | undefined) ?? today());
    }
  },

  /** On submit (not draft), post the invoice to the GL. Idempotent — a re-save of an
   *  already-posted invoice is a no-op (the ledger dedupes by voucher). */
  async afterSave(doc, tx) {
    if (doc.status === 'draft') return;
    const rule = getPostingRule(doc.slug);
    if (!rule) return;
    const postingDate = (doc.data['date'] as string | undefined) ?? today();
    const voucher = await buildVoucher(rule, { code: doc.code, data: doc.data }, postingDate);
    // Post on the document's transaction so save + GL post are atomic.
    await ledgerService.post(voucher, tx?.manager);
  },
};
