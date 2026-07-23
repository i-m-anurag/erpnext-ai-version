import { stockLedgerService, type StockMovementLine } from '../../stock/stock-ledger.service.js';
import { BadRequestError } from '../../../shared/errors.js';
import type { FormController } from '../form-controller.js';

/** Today as an ISO date (yyyy-mm-dd). */
const today = (): string => new Date().toISOString().slice(0, 10);

interface ReceiptLine {
  item?: string;
  quantity?: unknown;
  warehouse?: string;
  rate?: unknown;
  remarks?: string;
}

const linesOf = (v: unknown): ReceiptLine[] => (Array.isArray(v) ? (v as ReceiptLine[]) : []);

/**
 * Purchase Receipt — goods physically arriving from a supplier. This is the document
 * that brings stock IN (the Purchase Invoice that follows only bills for it).
 *
 * On submit it records one stock movement per line via the stock ledger, inside the
 * document's own transaction, so the receipt and the stock it created commit together.
 * The financial posting (Dr Stock In Hand / Cr Stock Received But Not Billed) is added
 * in the perpetual-inventory phase and will be derived from the movement's value.
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
      if (Number(l.quantity ?? 0) <= 0) throw new BadRequestError(`receiving ${l.item} requires a quantity above zero`);
      if (Number(l.rate ?? 0) <= 0) throw new BadRequestError(`receiving ${l.item} requires a rate above zero`);
    }
    await stockLedgerService.assertNotFrozen((ctx.input['date'] as string | undefined) ?? today());
  },

  /** Move the stock in, on the document's transaction (atomic with the save). */
  async afterSave(doc, tx) {
    if (doc.status === 'draft') return;
    const lines: StockMovementLine[] = linesOf(doc.data['items']).map((l, idx) => ({
      itemCode: String(l.item),
      warehouse: String(l.warehouse),
      qty: Number(l.quantity ?? 0), // positive → receipt into stock
      rate: Number(l.rate ?? 0),
      detailNo: String(idx),
      remarks: l.remarks ?? null,
    }));
    if (lines.length === 0) return;

    await stockLedgerService.post(
      {
        voucherType: doc.slug,
        voucherNo: doc.code,
        postingDate: (doc.data['date'] as string | undefined) ?? today(),
        lines,
      },
      tx?.manager,
    );
  },
};
