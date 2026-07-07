import { activityService } from '../../activity/index.js';
import type { FormController } from '../form-controller.js';

/**
 * EXAMPLE form controller — the server-side business logic for `purchase-order`.
 * Copy this file to add logic for another form (one file per slug); nothing about
 * it is special beyond being registered in register-form-controllers.ts.
 *
 * Demonstrates all three hooks. In a real Material-Request-style flow, computeStatus
 * would derive the status from linked documents (POs raised, qty received) instead
 * of a single amount threshold.
 */
export const purchaseOrderController: FormController = {
  /** Keep the header `amount` in sync with the line items before persisting. */
  beforeSave(ctx) {
    const lines = ctx.input['lines'];
    if (Array.isArray(lines) && lines.length > 0) {
      const total = lines.reduce((sum, row) => {
        const r = row as Record<string, unknown>;
        return sum + Number(r['qty'] ?? 0) * Number(r['rate'] ?? 0);
      }, 0);
      if (total > 0) ctx.input['amount'] = total;
    }
  },

  /** Derive the business status shown on the record. */
  computeStatus(doc) {
    if (doc.status === 'draft') return 'Draft';
    const amount = Number(doc.data['amount'] ?? 0);
    return amount > 100000 ? 'High Value' : 'Standard';
  },

  /** Record the outcome on the activity timeline (skip noisy draft saves). */
  async afterSave(doc) {
    if (doc.status === 'draft') return;
    await activityService.addTimeline(
      doc.slug,
      doc.code,
      'state_changed',
      `Status set to ${doc.state}`,
      null,
    );
  },
};
