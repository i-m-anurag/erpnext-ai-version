import type { FormController } from '../form-controller.js';

interface Line {
  qty?: number;
  orderedQty?: number;
  receivedQty?: number;
  issuedQty?: number;
  transferredQty?: number;
}

/**
 * Material Request (a.k.a. Requisition) business logic. `computeStatus` derives the
 * ERPNext Material Request status from the request's purpose + line-item fulfilment.
 *
 * In a full flow the ordered/received/issued/transferred quantities would be pushed
 * onto the lines by linked documents (Purchase Orders, Purchase Receipts, Stock
 * Entries). Here the controller only READS those quantities and derives the status —
 * exactly the "form-specific business logic" seam; wiring the linked docs that write
 * the quantities is separate and out of scope.
 */
export const requisitionController: FormController = {
  computeStatus(doc) {
    // Lifecycle statuses win first.
    if (doc.status === 'draft') return 'Draft';
    if (doc.status === 'archived') return 'Cancelled';

    const d = doc.data;
    if (d['stopped'] === true) return 'Stopped';

    const lines = Array.isArray(d['items']) ? (d['items'] as Line[]) : [];
    const sum = (k: keyof Line): number => lines.reduce((s, r) => s + Number(r[k] ?? 0), 0);
    const total = sum('qty');
    if (total <= 0) return 'Pending';

    const type = String(d['materialRequestType'] ?? 'Purchase');

    if (type === 'Material Issue') {
      return sum('issuedQty') >= total ? 'Issued' : 'Pending';
    }
    if (type === 'Material Transfer') {
      return sum('transferredQty') >= total ? 'Transferred' : 'Pending';
    }

    // Purchase: Pending → Partially Ordered → Ordered → Received.
    if (sum('receivedQty') >= total) return 'Received';
    const ordered = sum('orderedQty');
    if (ordered >= total) return 'Ordered';
    if (ordered > 0) return 'Partially Ordered';
    return 'Pending';
  },
};
