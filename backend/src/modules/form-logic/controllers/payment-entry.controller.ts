import { ledgerService } from '../../ledger/index.js';
import type { FormController } from '../form-controller.js';

/**
 * Payment Entry business logic. On submit it posts to the GL — the mapping depends
 * on the payment type + mode, so it builds the voucher directly (a flat posting rule
 * can't branch):
 *   Pay (to supplier):      Dr Creditors (party)   Cr Cash/Bank
 *   Receive (from customer): Dr Cash/Bank           Cr Debtors (party)
 * Idempotent — a re-save of a posted payment is a no-op.
 */
export const paymentEntryController: FormController = {
  async afterSave(doc) {
    if (doc.status === 'draft') return;
    const d = doc.data;
    const amount = Number(d['amount'] ?? 0);
    if (!amount) return;

    const party = (d['party'] as string | undefined) ?? null;
    const modeAccount = d['mode'] === 'Cash' ? 'cash' : 'bank';
    const postingDate = (d['paymentDate'] as string | undefined) ?? new Date();

    const lines =
      d['paymentType'] === 'Receive'
        ? [
            { account: modeAccount, debit: amount, credit: 0 },
            { account: 'debtors', debit: 0, credit: amount, party },
          ]
        : [
            { account: 'creditors', debit: amount, credit: 0, party },
            { account: modeAccount, debit: 0, credit: amount },
          ];

    await ledgerService.post({ voucherType: doc.slug, voucherNo: doc.code, postingDate, lines });
  },
};
