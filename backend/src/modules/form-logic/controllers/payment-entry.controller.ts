import { ledgerService } from '../../ledger/index.js';
import { buildVoucher, getPostingRule } from '../../ledger/posting-rule.js';
import type { FormController } from '../form-controller.js';

/** Today as an ISO date (yyyy-mm-dd) — the posting date must be a date, not a
 *  timestamp, so it lands in the right day regardless of server timezone. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Payment Entry business logic. The GL mapping now lives in
 * seed-data/base/posting-rules/payment-entry.json — a conditional rule that branches
 * on `paymentType` and takes the bank/cash account straight from the document
 * (`accountPaidFrom` / `accountPaidTo`), with the party control account resolved by
 * Chart-of-Accounts role. So this controller no longer hardcodes accounts or
 * option values; tuning a payment posting is a config edit.
 */
export const paymentEntryController: FormController = {
  /** Reject a frozen-period posting before the document is persisted. */
  async beforeSave(ctx) {
    if (!ctx.draft) {
      await ledgerService.assertNotFrozen((ctx.input['date'] as string | undefined) ?? today());
    }
  },

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
