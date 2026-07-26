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
  /**
   * For an incoming leg (qty > 0), value it at another warehouse's CURRENT rate
   * instead of a fixed `rate`. A transfer uses this: the target receives at the
   * source's rate, resolved inside the post lock before any leg moves, so the value
   * can't change between deciding the rate and applying it (and an emptied source
   * can't leave the target valued at zero).
   */
  rateFromWarehouse?: string | null;
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
 * Take a transaction-scoped advisory lock on each distinct (item, warehouse) a
 * movement touches, in sorted order. Sorting is the deadlock guard: two posts that
 * both touch pairs A and B acquire them in the same order, so neither can hold A
 * while waiting on the other's B.
 */
async function lockItemWarehouses(db: Pick<EntityManager, 'query'>, keys: string[]): Promise<void> {
  const distinct = [...new Set(keys)].sort();
  for (const k of distinct) {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sle-iw|${k}`]);
  }
}

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
      // An incoming leg needs a rate — unless it inherits one from another warehouse,
      // in which case the rate is resolved inside the lock, not supplied here.
      if (d(l.qty).gt(0) && !l.rateFromWarehouse && d(l.rate).lte(0)) {
        throw new BadRequestError(`receiving ${l.itemCode} requires a rate greater than zero`);
      }
    }

    await this.assertNotFrozen(movement.postingDate);

    const run = async (db: EntityManager): Promise<{ posted: boolean; lines: number; totalValueDifference: string }> => {
      // Serialise concurrent posts of the same voucher (advisory lock releases on commit).
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `sle|${movement.voucherType}|${movement.voucherNo}`,
      ]);
      // AND serialise every post touching the same (item, warehouse), whatever its
      // voucher — otherwise two receipts of one item could both read the same prior
      // balance and one update is lost, silently corrupting the running balance and
      // valuation. Locks are taken in a stable sorted order so two multi-item posts
      // can't deadlock by grabbing the same pair in opposite order. A `rateFromWarehouse`
      // reference is locked too, so the rate it lends can't shift under us.
      await lockItemWarehouses(
        db,
        movement.lines.flatMap((l) =>
          l.rateFromWarehouse
            ? [`${l.itemCode}|${l.warehouse}`, `${l.itemCode}|${l.rateFromWarehouse}`]
            : [`${l.itemCode}|${l.warehouse}`],
        ),
      );

      const seen = (await db.query(
        `SELECT 1 FROM stock_ledger_entry WHERE voucher_type=$1 AND voucher_no=$2 LIMIT 1`,
        [movement.voucherType, movement.voucherNo],
      )) as unknown[];
      if (seen.length > 0) return { posted: false, lines: 0, totalValueDifference: '0.000000' };

      // Resolve every "value at another warehouse's rate" reference NOW — inside the
      // lock, before any leg mutates a balance. Reading it later would see the rate the
      // issue leg leaves behind (zero, once the source is emptied); reading it in the
      // controller (as before) left a gap for a concurrent post to change it.
      const inheritedRate = new Map<string, Decimal>();
      for (const line of movement.lines) {
        if (d(line.qty).gt(0) && line.rateFromWarehouse) {
          const key = `${line.itemCode}|${line.rateFromWarehouse}`;
          if (!inheritedRate.has(key)) {
            inheritedRate.set(key, (await this.balance(line.itemCode, line.rateFromWarehouse, db)).valuationRate);
          }
        }
      }

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

        // The incoming unit cost: the line's own rate, or one inherited from another
        // warehouse (a transfer's target takes the source's rate, fixed inside the lock).
        const incomingRate = line.rateFromWarehouse
          ? (inheritedRate.get(`${line.itemCode}|${line.rateFromWarehouse}`) ?? new Decimal(0))
          : d(line.rate);

        // Moving average: a receipt blends the incoming cost into the running rate;
        // an issue leaves the rate untouched and simply reduces quantity.
        let newRate: Decimal;
        if (qty.gt(0)) {
          const inValue = qty.times(incomingRate);
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
            qty.gt(0) ? round6(incomingRate) : null,
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

  /**
   * Undo a voucher's stock movements by posting equal-and-opposite ones under
   * `<voucherNo>-REV`. The original rows are never touched — this ledger is
   * append-only, so a correction is a new entry, exactly as in the GL.
   *
   * Each reversal line negates BOTH the quantity and the value of the row it undoes,
   * rather than re-deriving a value from the current moving average. That is what keeps
   * the two ledgers reversible by the same amount: the GL reversal swaps the original
   * debit and credit, so if the stock side reversed a different figure the books would
   * drift the moment a rate changed.
   *
   * Negating the stored value is also the arithmetically right answer. Receive 40 @ ₹25
   * then 40 @ ₹35 (80 units, ₹2,400, average ₹30); reversing the first leaves 40 units
   * at ₹1,400 — the second receipt, valued at its own ₹35. The average repairs itself.
   *
   * Reversing goods that have since been issued fails the negative-stock guard, which is
   * the correct outcome: you cannot un-receive what you no longer have.
   */
  async reverse(
    voucherType: string,
    voucherNo: string,
    postingDate: Date | string,
    manager?: EntityManager,
  ): Promise<{ posted: boolean; lines: number; totalValueDifference: string }> {
    await this.assertNotFrozen(postingDate);

    const run = async (db: EntityManager): Promise<{ posted: boolean; lines: number; totalValueDifference: string }> => {
      const revNo = `${voucherNo}-REV`;
      await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`sle|${voucherType}|${revNo}`]);

      const already = (await db.query(
        `SELECT 1 FROM stock_ledger_entry WHERE voucher_type=$1 AND voucher_no=$2 LIMIT 1`,
        [voucherType, revNo],
      )) as unknown[];
      if (already.length > 0) return { posted: false, lines: 0, totalValueDifference: '0.000000' };

      const originals = (await db.query(
        `SELECT item_code, warehouse, actual_qty, stock_value_difference, voucher_detail_no
           FROM stock_ledger_entry
          WHERE voucher_type=$1 AND voucher_no=$2
          ORDER BY seq DESC`, // unwind in reverse, so a transfer's legs undo in order
        [voucherType, voucherNo],
      )) as Record<string, unknown>[];
      if (originals.length === 0) return { posted: false, lines: 0, totalValueDifference: '0.000000' };

      // Same cross-voucher serialisation as post(): a reversal reads current balances
      // to compute the new running rate, so it must not race another movement of the
      // same (item, warehouse).
      await lockItemWarehouses(db, originals.map((o) => `${String(o.item_code)}|${String(o.warehouse)}`));

      let total = new Decimal(0);
      for (const o of originals) {
        const itemCode = String(o.item_code);
        const warehouse = String(o.warehouse);
        await this.assertNotBackDated(itemCode, warehouse, postingDate, db);

        const prev = await this.balance(itemCode, warehouse, db);
        const qty = d(o.actual_qty as string).negated();
        const valueDiff = d(o.stock_value_difference as string).negated();
        const newQty = prev.qty.plus(qty);

        if (newQty.lt(0)) {
          throw new BadRequestError(
            `cannot reverse ${voucherNo}: ${itemCode} @ ${warehouse} has ${prev.qty.toFixed(2)}, ` +
              `reversing needs ${qty.abs().toFixed(2)} — the stock has already moved on`,
          );
        }

        const newValue = prev.stockValue.plus(valueDiff);
        const newRate = newQty.isZero() ? new Decimal(0) : newValue.dividedBy(newQty);
        const unitRate = qty.isZero() ? new Decimal(0) : valueDiff.abs().dividedBy(qty.abs());

        await db.query(
          `INSERT INTO stock_ledger_entry
             (posting_date, item_code, warehouse, actual_qty, incoming_rate, outgoing_rate,
              qty_after_transaction, valuation_rate, stock_value, stock_value_difference,
              voucher_type, voucher_no, voucher_detail_no, remarks)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [
            postingDate,
            itemCode,
            warehouse,
            round6(qty),
            qty.gt(0) ? round6(unitRate) : null,
            qty.lt(0) ? round6(unitRate) : null,
            round6(newQty),
            round6(newRate),
            round6(newValue),
            round6(valueDiff),
            voucherType,
            revNo,
            (o.voucher_detail_no as string | null) ?? null,
            `Reversal of ${voucherNo}`,
          ],
        );
        total = total.plus(valueDiff);
      }

      return { posted: true, lines: originals.length, totalValueDifference: round6(total) };
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
