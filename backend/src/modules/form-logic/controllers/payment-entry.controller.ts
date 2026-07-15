import { accountService } from '../../accounts/index.js';
import { ledgerService } from '../../ledger/index.js';
import type { FormController } from '../form-controller.js';

/** Today as an ISO date (yyyy-mm-dd) — the posting date must be a date, not a
 *  timestamp, so it lands in the right day regardless of server timezone. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Payment Entry business logic. On submit it posts to the GL — the mapping depends
 * on the payment type + mode, so it builds the voucher directly (a flat posting rule
 * can't branch):
 *   Pay (to supplier):      Dr Payable (party)   Cr Cash/Bank
 *   Receive (from customer): Dr Cash/Bank         Cr Receivable (party)
 * Control accounts are resolved from the Chart of Accounts by role (not hardcoded
 * codes). Idempotent — a re-save of a posted payment is a no-op.
 */
export const paymentEntryController: FormController = {
  /** Reject a frozen-period posting before the document is persisted. */
  async beforeSave(ctx) {
    if (!ctx.draft) {
      await ledgerService.assertNotFrozen((ctx.input['paymentDate'] as string | undefined) ?? today());
    }
  },

  async afterSave(doc) {
    if (doc.status === 'draft') return;
    const d = doc.data;
    const amount = Number(d['amount'] ?? 0);
    if (!amount) return;

    const party = (d['party'] as string | undefined) ?? null;
    const modeAccount = await accountService.resolveByType(d['mode'] === 'Cash' ? 'Cash' : 'Bank');
    const postingDate = (d['paymentDate'] as string | undefined) ?? today();

    const lines =
      d['paymentType'] === 'Receive'
        ? [
            { account: modeAccount, debit: amount, credit: 0 },
            { account: await accountService.resolveByType('Receivable'), debit: 0, credit: amount, party },
          ]
        : [
            { account: await accountService.resolveByType('Payable'), debit: amount, credit: 0, party },
            { account: modeAccount, debit: 0, credit: amount },
          ];

    await ledgerService.post({ voucherType: doc.slug, voucherNo: doc.code, postingDate, lines });
  },
};
