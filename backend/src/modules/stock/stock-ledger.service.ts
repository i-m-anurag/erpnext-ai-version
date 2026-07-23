import { Decimal } from 'decimal.js';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../../db/data-source.js';
import { BadRequestError } from '../../shared/errors.js';
import { ledgerSettingsService } from '../ledger/ledger-settings.service.js';

/**
 * One requested stock movement — a single document LINE's effect on one warehouse.
 * `qty` is signed: positive receives into stock, negative issues out.
 * `rate` is the incoming unit cost and is REQUIRED for receipts (ignored on issues,
 * where the outgoing rate is derived from the running valuation).
 */
export interface StockMovementLine {
  itemCode: string;
  warehouse: string;
  qty: number | string;
  rate?: number | string;
  detailNo?: string | null;
  remarks?: string | null;
}

export interface StockMovement {
  voucherType: string;
  voucherNo: string;
  postingDate: Date | string;
  lines: StockMovementLine[];
}

/** The running balance for an (item, warehouse) after the latest movement. */
export interface StockBalance {
  qty: Decimal;
  valuationRate: Decimal;
  stockValue: Decimal;
}

const d = (v: number | string | null | undefined): Decimal =>
  v === null || v === undefined || v === '' ? new Decimal(0) : new Decimal(String(v));

const ZERO_BALANCE: StockBalance = { qty: new Decimal(0), valuationRate: new Decimal(0), stockValue: new Decimal(0) };

/** Money/qty are stored at 6dp; round consistently so balances don't drift. */
const round6 = (v: Decimal): string => v.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed(6);

/**
 * The stock ledger — the inventory sibling of `ledgerService`.
 *
 * Deliberate simplifications versus ERPNext, each removing a whole class of bugs:
 *  • **Moving average only.** No persisted FIFO queue, so no per-row queue state.
 *  • **No back-dating.** A movement may not predate the latest movement for the same
 *    (item, warehouse). Insert order is therefore chronological, which is why running
 *    balances never need recomputing — ERPNext's "Repost Item Valuation" engine exists
 *    purely to fix what back-dating breaks.
 *  • **No negative stock.** An issue may not drive the balance below zero; allowing it
 *    is a documented source of stock-ledger vs general-ledger divergence.
 *
 * Balances are computed BEFORE the delta: we derive the new qty/value, then record
 * `stockValueDifference` as the change. Posting only that figure to the GL is what
 * makes the two ledgers agree by construction.
 */
export class StockLedgerService {
  /** Latest running balance for an (item, warehouse). */
  async balance(itemCode: string, warehouse: string, db: Pick<EntityManager, 'query'> = AppDataSource): Promise<StockBalance> {
    const rows = (await db.query(
      `SELECT qty_after_transaction, valuation_rate, stock_value
         FROM stock_ledger_entry
        WHERE item_code = $1 AND warehouse = $2
        ORDER BY seq DESC
        LIMIT 1`,
      [itemCode, warehouse],
    )) as Record<string, unknown>[];
    const r = rows[0];
    if (!r) return ZERO_BALANCE;
    return {
      qty: d(r.qty_after_transaction as string),
      valuationRate: d(r.valuation_rate as string),
      stockValue: d(r.stock_value as string),
    };
  }

  /** Reject a posting date inside a frozen period (shared with the financial ledger). */
  async assertNotFrozen(postingDate: Date | string): Promise<void> {
    const freeze = await ledgerSettingsService.freezeDate();
    if (freeze && new Date(postingDate) <= freeze) {
      throw new BadRequestError(
        `posting date is in a frozen period (on/before ${freeze.toISOString().slice(0, 10)})`,
      );
    }
  }

  /**
   * Reject a movement dated before the latest movement for the same (item, warehouse).
   * This is the guard that lets us skip ERPNext's reposting engine: without back-dating,
   * every stored running balance stays correct forever.
   */
  private async assertNotBackDated(
    itemCode: string,
    warehouse: string,
    postingDate: Date | string,
    db: Pick<EntityManager, 'query'>,
  ): Promise<void> {
    const rows = (await db.query(
      `SELECT posting_date FROM stock_ledger_entry
        WHERE item_code = $1 AND warehouse = $2
        ORDER BY seq DESC LIMIT 1`,
      [itemCode, warehouse],
    )) as { posting_date: Date }[];
    const last = rows[0]?.posting_date;
    if (last && new Date(postingDate) < new Date(last)) {
      throw new BadRequestError(
        `back-dated stock movement is not allowed: ${itemCode} @ ${warehouse} already has a movement on ` +
          `${new Date(last).toISOString().slice(0, 10)}; post on or after that date`,
      );
    }
  }

  /**
   * Record a stock movement. Idempotent by (voucherType, voucherNo) — re-saving a
   * document never double-counts. When `manager` is supplied the writes join the
   * caller's transaction, so stock, the document and the GL commit together.
   */
  async post(
    movement: StockMovement,
    manager?: EntityManager,
  ): Promise<{ posted: boolean; lines: number; totalValueDifference: string }> {
    if (movement.lines.length === 0) throw new BadRequestError('a stock movement needs at least one line');
    for (const l of movement.lines) {
      if (!l.itemCode) throw new BadRequestError('stock movement line is missing an item');
      if (!l.warehouse) throw new BadRequestError(`stock movement for ${l.itemCode} is missing a warehouse`);
      if (d(l.qty).isZero()) throw new BadRequestError(`stock movement for ${l.itemCode} has zero quantity`);
      if (d(l.qty).gt(0) && d(l.rate).lte(0)) {
        throw new BadRequestError(`receiving ${l.itemCode} requires a rate greater than zero`);
      }
    }

    await this.assertNotFrozen(movement.postingDate);

    const run = async (db: EntityManager): Promise<{ posted: boolean; lines: number; totalValueDifference: string }> => {
      // Serialise concurrent posts of the same voucher (advisory lock releases on commit).
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `sle|${movement.voucherType}|${movement.voucherNo}`,
      ]);
      const seen = (await db.query(
        `SELECT 1 FROM stock_ledger_entry WHERE voucher_type=$1 AND voucher_no=$2 LIMIT 1`,
        [movement.voucherType, movement.voucherNo],
      )) as unknown[];
      if (seen.length > 0) return { posted: false, lines: 0, totalValueDifference: '0.000000' };

      let total = new Decimal(0);
      for (const line of movement.lines) {
        await this.assertNotBackDated(line.itemCode, line.warehouse, movement.postingDate, db);

        const prev = await this.balance(line.itemCode, line.warehouse, db);
        const qty = d(line.qty);
        const newQty = prev.qty.plus(qty);

        if (newQty.lt(0)) {
          throw new BadRequestError(
            `insufficient stock: ${line.itemCode} @ ${line.warehouse} has ${prev.qty.toFixed(2)}, ` +
              `cannot issue ${qty.abs().toFixed(2)}`,
          );
        }

        // Moving average: a receipt blends the incoming cost into the running rate;
        // an issue leaves the rate untouched and simply reduces quantity.
        let newRate: Decimal;
        if (qty.gt(0)) {
          const inValue = qty.times(d(line.rate));
          newRate = newQty.isZero() ? new Decimal(0) : prev.stockValue.plus(inValue).dividedBy(newQty);
        } else {
          newRate = prev.valuationRate;
        }

        // Balance first, delta second — the delta is what the GL will post.
        const newValue = newQty.isZero() ? new Decimal(0) : newQty.times(newRate);
        const valueDiff = newValue.minus(prev.stockValue);
        const outgoingRate = qty.lt(0) ? valueDiff.abs().dividedBy(qty.abs()) : null;

        await db.query(
          `INSERT INTO stock_ledger_entry
             (posting_date, item_code, warehouse, actual_qty, incoming_rate, outgoing_rate,
              qty_after_transaction, valuation_rate, stock_value, stock_value_difference,
              voucher_type, voucher_no, voucher_detail_no, remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            movement.postingDate,
            line.itemCode,
            line.warehouse,
            round6(qty),
            qty.gt(0) ? round6(d(line.rate)) : null,
            outgoingRate ? round6(outgoingRate) : null,
            round6(newQty),
            round6(newRate),
            round6(newValue),
            round6(valueDiff),
            movement.voucherType,
            movement.voucherNo,
            line.detailNo ?? null,
            line.remarks ?? null,
          ],
        );
        total = total.plus(valueDiff);
      }

      return { posted: true, lines: movement.lines.length, totalValueDifference: round6(total) };
    };

    return manager ? run(manager) : AppDataSource.transaction(run);
  }

  /** Every movement of one voucher (for a document's "Stock Entries" panel). */
  async forVoucher(voucherType: string, voucherNo: string): Promise<Record<string, unknown>[]> {
    return (await AppDataSource.query(
      `SELECT * FROM stock_ledger_entry WHERE voucher_type=$1 AND voucher_no=$2 ORDER BY seq`,
      [voucherType, voucherNo],
    )) as Record<string, unknown>[];
  }

  /** Whether a voucher has already moved stock (used to lock a posted document). */
  async hasEntries(voucherType: string, voucherNo: string): Promise<boolean> {
    const rows = (await AppDataSource.query(
      `SELECT 1 FROM stock_ledger_entry WHERE voucher_type=$1 AND voucher_no=$2 LIMIT 1`,
      [voucherType, voucherNo],
    )) as unknown[];
    return rows.length > 0;
  }
}

export const stockLedgerService = new StockLedgerService();
