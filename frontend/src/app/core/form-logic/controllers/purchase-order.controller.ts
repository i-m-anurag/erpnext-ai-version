import type { FormController } from '../form-controller.js';

/**
 * EXAMPLE client controller for `purchase-order`. Copy this file (one per slug) to
 * add another form's client logic; register it in ../index.ts.
 *
 * Pairs with the server-side purchase-order.controller.ts: the server derives and
 * persists `state` ("Draft" / "Standard" / "High Value"); here we only decide how
 * that badge looks and add a form-specific header action.
 */
export const purchaseOrderController: FormController = {
  status(record) {
    switch (record.state) {
      case 'High Value':
        return { label: 'High Value', tone: 'warn' };
      case 'Standard':
        return { label: 'Standard', tone: 'info' };
      case 'Draft':
        return { label: 'Draft', tone: 'default' };
      default:
        return undefined; // fall back to the raw state/status
    }
  },

  actions(record) {
    // A form-specific button, shown only for high-value orders.
    if (record.state !== 'High Value') return [];
    return [
      {
        key: 'flag-review',
        label: 'Flag for review',
        icon: 'ph-flag',
        run: (rec, ctx) => ctx.notify(`${rec.code} flagged for finance review`),
      },
    ];
  },
};
