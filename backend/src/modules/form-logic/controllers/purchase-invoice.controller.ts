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
 */
export const purchaseInvoiceController: FormController = {
  /** Keep grandTotal in sync with the line items before persisting, and reject a
   *  frozen-period posting BEFORE the document is written (so a rejected post can't
   *  leave a persisted-but-unposted document behind). */
  async beforeSave(ctx) {
    const lines = ctx.input['lines'];
    if (Array.isArray(lines)) {
      const total = lines.reduce((sum, row) => {
        const r = row as Record<string, unknown>;
        return sum + Number(r['qty'] ?? 0) * Number(r['rate'] ?? 0);
      }, 0);
      ctx.input['grandTotal'] = total;
    }
    if (!ctx.draft) {
      await ledgerService.assertNotFrozen((ctx.input['invoiceDate'] as string | undefined) ?? today());
    }
  },

  /** On submit (not draft), post the invoice to the GL. Idempotent — a re-save of an
   *  already-posted invoice is a no-op (the ledger dedupes by voucher). */
  async afterSave(doc, tx) {
    if (doc.status === 'draft') return;
    const rule = getPostingRule(doc.slug);
    if (!rule) return;
    const postingDate = (doc.data['invoiceDate'] as string | undefined) ?? today();
    // Post on the document's transaction so save + GL post are atomic.
    await ledgerService.post(buildVoucher(rule, { code: doc.code, data: doc.data }, postingDate), tx?.manager);
  },
};
