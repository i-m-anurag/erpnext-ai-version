import { activityService } from '../../activity/index.js';
import { documentService } from '../../document/document.service.js';
import { documentDataService } from '../../document/document-data.service.js';
import type { FormController } from '../form-controller.js';

/**
 * Server-side business logic for `purchase-order`. Also drives the linked-document
 * propagation that advances a Material Request's status: when a PO (created from a
 * requisition) is saved, the requisition's `orderedQty` is recomputed and its own
 * controller re-derives its status (Pending → Partially Ordered → Ordered).
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

  /** Log the outcome, then push ordered quantities up to any source requisition. */
  async afterSave(doc) {
    if (doc.status === 'draft') return;
    await activityService.addTimeline(doc.slug, doc.code, 'state_changed', `Status set to ${doc.state}`, null);
    await propagateOrderedToRequisitions(doc.code);
  },
};

/** For each requisition this PO was created from, recompute its ordered quantities. */
async function propagateOrderedToRequisitions(poCode: string): Promise<void> {
  const parents = await documentService.links('purchase-order', poCode);
  const mrCodes = parents.filter((l) => l.direction === 'up' && l.master === 'requisition').map((l) => l.code);
  for (const mrCode of mrCodes) await recomputeRequisitionOrdered(mrCode);
}

/**
 * Idempotent: sum the PO line quantities across ALL purchase orders linked to the
 * requisition (per item) and set each requisition line's `orderedQty` to that sum,
 * then re-save through the master service so the requisition controller re-derives
 * its status. Summing (not incrementing) means re-saving a PO never double-counts.
 */
async function recomputeRequisitionOrdered(mrCode: string): Promise<void> {
  const links = await documentService.links('requisition', mrCode);
  const poCodes = links.filter((l) => l.direction === 'down' && l.master === 'purchase-order').map((l) => l.code);

  const orderedByItem = new Map<string, number>();
  for (const po of poCodes) {
    const { data } = await documentDataService.getByCode('purchase-order', po);
    const lines = Array.isArray(data['lines']) ? (data['lines'] as Record<string, unknown>[]) : [];
    for (const ln of lines) {
      const item = String(ln['item'] ?? '');
      if (item) orderedByItem.set(item, (orderedByItem.get(item) ?? 0) + Number(ln['qty'] ?? 0));
    }
  }

  const mr = await documentDataService.getByCode('requisition', mrCode);
  const items = Array.isArray(mr.data['items']) ? (mr.data['items'] as Record<string, unknown>[]) : [];
  // Numeric columns come back from Postgres as strings; coerce so the requisition
  // form re-validates cleanly on save.
  const numKeys = ['qty', 'orderedQty', 'receivedQty', 'issuedQty', 'transferredQty'];
  const num = (v: unknown): number => (v == null || v === '' ? 0 : Number(v));
  const updated = {
    ...mr.data,
    items: items.map((it) => {
      const row: Record<string, unknown> = { ...it };
      for (const k of numKeys) row[k] = num(row[k]);
      row['orderedQty'] = orderedByItem.get(String(it['item'] ?? '')) ?? 0;
      return row;
    }),
  };
  // Route through the master service (lazy import avoids the form-logic ↔ master
  // import cycle) so the requisition controller recomputes + persists its status.
  const { masterService } = await import('../../master/master.service.js');
  await masterService.updateData('requisition', mr.id, updated, false);
}
