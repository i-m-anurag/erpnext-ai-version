import { stockLedgerService, type StockMovementLine } from '../../stock/stock-ledger.service.js';
import { stockGlService } from '../../stock/stock-gl.service.js';
import { BadRequestError } from '../../../shared/errors.js';
import type { FormController } from '../form-controller.js';

/** Today as an ISO date (yyyy-mm-dd). */
const today = (): string => new Date().toISOString().slice(0, 10);

/** A finite number, or NaN — so `pos(x) > 0` is false for '', 'abc' and null alike.
 *  `Number('abc') <= 0` is false (NaN), which would let junk slip past a naive guard. */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

interface ReceiptLine {
  item?: string;
  quantity?: unknown;
  warehouse?: string;
  rejectedQuantity?: unknown;
  rejectedWarehouse?: string;
  rate?: unknown;
  remarks?: string;
}

const linesOf = (v: unknown): ReceiptLine[] => (Array.isArray(v) ? (v as ReceiptLine[]) : []);

/**
 * Purchase Receipt — goods physically arriving from a supplier. This is the document
 * that brings stock IN (the Purchase Invoice that follows only bills for it).
 *
 * A line can accept some units and reject others. Both are received — the accepted
 * quantity into its warehouse, the rejected quantity into the rejected warehouse — so
 * the goods are on the books wherever they physically are. Rejected stock sits in its
 * own warehouse until it is returned to the supplier.
 *
 * On submit it records those movements via the stock ledger, then posts the money side
 * of the same event — Dr Stock In Hand, Cr Stock Received But Not Billed — for the whole
 * received value. All of it commits inside the document's own transaction.
 *
 * SRBNB is a holding account: the goods are ours and owed for, but the supplier has not
 * invoiced yet. The Purchase Invoice that follows debits SRBNB back to nil and credits
 * the supplier, so nothing is counted twice.
 */
export const purchaseReceiptController: FormController = {
  /** Validate the lines and reject a frozen-period posting BEFORE anything persists. */
  async beforeSave(ctx) {
    if (ctx.draft) return;
    const lines = linesOf(ctx.input['items']);
    if (lines.length === 0) throw new BadRequestError('a purchase receipt needs at least one item line');
    for (const l of lines) {
      if (!l.item) throw new BadRequestError('every receipt line needs an item');
      if (!l.warehouse) throw new BadRequestError(`receiving ${l.item} requires a warehouse`);
      if (!(num(l.quantity) > 0)) throw new BadRequestError(`receiving ${l.item} requires a quantity above zero`);
      if (!(num(l.rate) > 0)) throw new BadRequestError(`receiving ${l.item} requires a rate above zero`);
      const rejected = num(l.rejectedQuantity);
      if (rejected > 0 && !l.rejectedWarehouse) {
        throw new BadRequestError(`${l.item}: rejected units need a rejected warehouse`);
      }
    }
    await stockLedgerService.assertNotFrozen((ctx.input['date'] as string | undefined) ?? today());
  },

  /** Move the stock in (accepted + rejected) and post its value, on the document's transaction. */
  async afterSave(doc, tx) {
    if (doc.status === 'draft') return;

    const lines: StockMovementLine[] = [];
    linesOf(doc.data['items']).forEach((l, idx) => {
      const rate = num(l.rate) || 0;
      // Accepted units into the receiving warehouse.
      lines.push({
        itemCode: String(l.item),
        warehouse: String(l.warehouse),
        qty: num(l.quantity) || 0, // positive → receipt into stock
        rate,
        detailNo: String(idx),
        remarks: l.remarks ?? null,
      });
      // Rejected units into the rejected warehouse, valued at the same rate. A second
      // movement under the same voucher, so the GL posting below covers both.
      const rejected = num(l.rejectedQuantity) || 0;
      if (rejected > 0 && l.rejectedWarehouse) {
        lines.push({
          itemCode: String(l.item),
          warehouse: String(l.rejectedWarehouse),
          qty: rejected,
          rate,
          detailNo: `${idx}-rej`,
          remarks: l.remarks ?? null,
        });
      }
    });
    if (lines.length === 0) return;

    const postingDate = (doc.data['date'] as string | undefined) ?? today();
    const moved = await stockLedgerService.post(
      { voucherType: doc.slug, voucherNo: doc.code, postingDate, lines },
      tx?.manager,
    );
    // Already posted (a re-save of a submitted receipt) — the GL is already right too.
    if (!moved.posted) return;

    await stockGlService.postMovement(doc, moved.totalValueDifference, postingDate, tx?.manager);
  },
};
