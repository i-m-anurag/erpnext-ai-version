import { stockLedgerService, type StockMovementLine } from '../../stock/stock-ledger.service.js';
import { stockGlService } from '../../stock/stock-gl.service.js';
import { BadRequestError } from '../../../shared/errors.js';
import type { FormController } from '../form-controller.js';

const today = (): string => new Date().toISOString().slice(0, 10);

/** A finite number or NaN, so `num(x) > 0` is false for '', 'abc' and null alike —
 *  `Number('abc') <= 0` is false (NaN), which would let junk past a naive guard. */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** The three movements a Stock Entry can express. */
const RECEIPT = 'Material Receipt';
const ISSUE = 'Material Issue';
const TRANSFER = 'Material Transfer';

interface EntryLine {
  item?: string;
  quantity?: unknown;
  sourceWarehouse?: string;
  targetWarehouse?: string;
  rate?: unknown;
  remarks?: string;
}

const linesOf = (v: unknown): EntryLine[] => (Array.isArray(v) ? (v as EntryLine[]) : []);

/** Which warehouses a purpose requires — the difference between the three types. */
function validateLine(purpose: string, l: EntryLine): void {
  if (!l.item) throw new BadRequestError('every stock entry line needs an item');
  if (!(num(l.quantity) > 0)) throw new BadRequestError(`${l.item}: quantity must be above zero`);

  if (purpose === RECEIPT) {
    if (!l.targetWarehouse) throw new BadRequestError(`${l.item}: a Material Receipt needs a target warehouse`);
    if (!(num(l.rate) > 0)) throw new BadRequestError(`${l.item}: a Material Receipt needs a rate above zero`);
  } else if (purpose === ISSUE) {
    if (!l.sourceWarehouse) throw new BadRequestError(`${l.item}: a Material Issue needs a source warehouse`);
  } else if (purpose === TRANSFER) {
    if (!l.sourceWarehouse || !l.targetWarehouse) {
      throw new BadRequestError(`${l.item}: a Material Transfer needs both a source and a target warehouse`);
    }
    if (l.sourceWarehouse === l.targetWarehouse) {
      throw new BadRequestError(`${l.item}: source and target warehouse must differ`);
    }
  } else {
    throw new BadRequestError(`unknown stock entry purpose: ${purpose}`);
  }
}

/**
 * Stock Entry — the general-purpose stock document, the inventory equivalent of a
 * Journal Entry. Three purposes:
 *   • Material Receipt  — stock appears (opening stock, production output)  → +qty
 *   • Material Issue    — stock is consumed/scrapped                        → −qty
 *   • Material Transfer — stock moves between warehouses      → −source, +target
 *
 * A transfer must not create or destroy value, so the target is received at the
 * source's CURRENT valuation rate (read before the issue; under moving average an
 * issue leaves the rate unchanged, so this is the correct rate for both legs).
 */
export const stockEntryController: FormController = {
  async beforeSave(ctx) {
    if (ctx.draft) return;
    const purpose = String(ctx.input['stockEntryType'] ?? '');
    const lines = linesOf(ctx.input['items']);
    if (lines.length === 0) throw new BadRequestError('a stock entry needs at least one item line');
    for (const l of lines) validateLine(purpose, l);
    await stockLedgerService.assertNotFrozen((ctx.input['date'] as string | undefined) ?? today());
  },

  async afterSave(doc, tx) {
    if (doc.status === 'draft') return;
    const purpose = String(doc.data['stockEntryType'] ?? '');
    const rows = linesOf(doc.data['items']);
    if (rows.length === 0) return;

    const lines: StockMovementLine[] = [];
    for (const [idx, l] of rows.entries()) {
      const qty = Number(l.quantity ?? 0);
      const detailNo = String(idx);

      if (purpose === RECEIPT) {
        lines.push({
          itemCode: String(l.item), warehouse: String(l.targetWarehouse),
          qty, rate: Number(l.rate ?? 0), detailNo, remarks: l.remarks ?? null,
        });
      } else if (purpose === ISSUE) {
        lines.push({
          itemCode: String(l.item), warehouse: String(l.sourceWarehouse),
          qty: -qty, detailNo, remarks: l.remarks ?? null,
        });
      } else if (purpose === TRANSFER) {
        // Value must survive the move: receive at the source's current rate.
        const src = await stockLedgerService.balance(String(l.item), String(l.sourceWarehouse));
        lines.push({
          itemCode: String(l.item), warehouse: String(l.sourceWarehouse),
          qty: -qty, detailNo, remarks: l.remarks ?? null,
        });
        lines.push({
          itemCode: String(l.item), warehouse: String(l.targetWarehouse),
          qty, rate: src.valuationRate.toString(), detailNo, remarks: l.remarks ?? null,
        });
      }
    }

    const postingDate = (doc.data['date'] as string | undefined) ?? today();
    const moved = await stockLedgerService.post(
      { voucherType: doc.slug, voucherNo: doc.code, postingDate, lines },
      tx?.manager,
    );
    if (!moved.posted) return;

    // Receipt and Issue change what the company owns, so they hit the GL; a Transfer
    // nets to zero value and its rule has no lines, so it posts nothing.
    await stockGlService.postMovement(doc, moved.totalValueDifference, postingDate, tx?.manager);
  },
};
