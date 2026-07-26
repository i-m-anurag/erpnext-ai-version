import type { EntityManager } from 'typeorm';
import { stockLedgerService, type StockMovementLine } from '../../stock/stock-ledger.service.js';
import { stockGlService } from '../../stock/stock-gl.service.js';
import { documentDataService } from '../../document/document-data.service.js';
import { BadRequestError } from '../../../shared/errors.js';
import type { FormController, FormDoc } from '../form-controller.js';
import { requisitionController } from './requisition.controller.js';

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

/** Which requisition line-quantity a stock purpose fulfils. */
const FULFILS: Record<string, 'issuedQty' | 'transferredQty'> = {
  [ISSUE]: 'issuedQty',
  [TRANSFER]: 'transferredQty',
};

interface ReqLine {
  item?: string;
  qty?: unknown;
  issuedQty?: unknown;
  transferredQty?: unknown;
  [k: string]: unknown;
}

/**
 * Move the fulfilled quantity on the Material Request this Stock Entry was created from.
 * `sign` is +1 when the entry is submitted (credit the request → Issued / Transferred)
 * and −1 when it is cancelled (give the quantity back → Pending). Without the +1 an
 * Issue/Transfer request would sit at Pending forever; without the −1 a cancelled
 * fulfilment would leave it wrongly showing Issued. Runs on the Stock Entry's own
 * transaction, so the request and the movement move together.
 */
async function applyToParentRequisition(
  doc: FormDoc,
  purpose: string,
  mgr: EntityManager,
  sign: 1 | -1,
): Promise<void> {
  const field = FULFILS[purpose];
  if (!field) return; // a Material Receipt fulfils no request

  const links = (await mgr.query(
    `SELECT from_code FROM document_links
      WHERE to_master='stock-entry' AND to_code=$1 AND from_master='requisition' LIMIT 1`,
    [doc.code],
  )) as { from_code: string }[];
  const reqCode = links[0]?.from_code;
  if (!reqCode) return; // a standalone Stock Entry, not raised from a request

  const req = await documentDataService.getByCode('requisition', reqCode);
  const reqLines = Array.isArray(req.data['items']) ? (req.data['items'] as ReqLine[]) : [];

  // Sum this entry's moved quantity per item, then apply it to the matching request line.
  const movedByItem = new Map<string, number>();
  for (const l of linesOf(doc.data['items'])) {
    const item = String(l.item ?? '');
    movedByItem.set(item, (movedByItem.get(item) ?? 0) + (num(l.quantity) || 0));
  }
  for (const rl of reqLines) {
    const moved = movedByItem.get(String(rl.item ?? ''));
    // Never below zero — a give-back can't drive fulfilled quantity negative.
    if (moved) rl[field] = Math.max(0, (num(rl[field]) || 0) + sign * moved);
  }

  const updated: FormDoc = { ...req, slug: 'requisition', data: { ...req.data, items: reqLines } } as FormDoc;
  const nextState = requisitionController.computeStatus?.(updated) ?? req.state;

  // Line items are child rows; write them and the recomputed state on this transaction.
  await documentDataService.setTableRows('requisition', req.id, 'items', reqLines, mgr);
  await documentDataService.setState('requisition', req.id, nextState, mgr);
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
        // Value must survive the move: the target receives at the source's rate. The
        // stock ledger resolves that rate inside its lock, so it can't shift between
        // deciding it and applying it (and an emptied source can't lend a zero rate).
        lines.push({
          itemCode: String(l.item), warehouse: String(l.sourceWarehouse),
          qty: -qty, detailNo, remarks: l.remarks ?? null,
        });
        lines.push({
          itemCode: String(l.item), warehouse: String(l.targetWarehouse),
          qty, rateFromWarehouse: String(l.sourceWarehouse), detailNo, remarks: l.remarks ?? null,
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

    // If this entry fulfils a Material Request, advance it on the same transaction.
    if (tx?.manager) await applyToParentRequisition(doc, purpose, tx.manager, 1);
  },

  /** Cancelled: give the fulfilled quantity back to the request (the stock and GL are
   *  reversed by the cancel path itself). */
  async afterReverse(doc, tx) {
    const purpose = String(doc.data['stockEntryType'] ?? '');
    if (tx?.manager) await applyToParentRequisition(doc, purpose, tx.manager, -1);
  },
};
