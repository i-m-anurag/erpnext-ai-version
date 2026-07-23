import { Decimal } from 'decimal.js';
import { AppDataSource } from '../../db/data-source.js';

export interface StockBalanceRow {
  itemCode: string;
  warehouse: string;
  qty: string;
  valuationRate: string;
  stockValue: string;
}

export interface StockLedgerRow {
  postingDate: string;
  itemCode: string;
  warehouse: string;
  actualQty: string;
  incomingRate: string | null;
  outgoingRate: string | null;
  qtyAfterTransaction: string;
  valuationRate: string;
  stockValue: string;
  stockValueDifference: string;
  voucherType: string;
  voucherNo: string;
}

export interface StockReconciliationRow {
  /** Total value the stock ledger says is on hand. */
  stockLedgerValue: string;
  /** Balance of the Stock In Hand account in the General Ledger. */
  generalLedgerValue: string;
  /** stockLedgerValue − generalLedgerValue. Zero when the two agree. */
  difference: string;
  inSync: boolean;
  /** Stock movements the GL never heard about — the usual cause of a difference. */
  unpostedVouchers: { voucherType: string; voucherNo: string; stockValueDifference: string }[];
}

/** The GL account perpetual inventory posts into. */
const STOCK_ACCOUNT = 'stock-in-hand';

/** Read models over the stock ledger. Balances are the LATEST row per (item, warehouse) —
 *  no separate Bin cache to drift, since every running balance is already stored. */
export class StockReportService {
  /** Current on-hand quantity and value per item + warehouse (zero balances dropped). */
  async balances(): Promise<{ rows: StockBalanceRow[]; totalValue: string }> {
    const rows = (await AppDataSource.query(
      `SELECT DISTINCT ON (item_code, warehouse)
              item_code, warehouse, qty_after_transaction, valuation_rate, stock_value
         FROM stock_ledger_entry
        ORDER BY item_code, warehouse, seq DESC`,
    )) as Record<string, unknown>[];

    const mapped = rows
      .filter((r) => Number(r.qty_after_transaction) !== 0)
      .map((r) => ({
        itemCode: String(r.item_code),
        warehouse: String(r.warehouse),
        qty: String(r.qty_after_transaction),
        valuationRate: String(r.valuation_rate),
        stockValue: String(r.stock_value),
      }));
    const total = mapped.reduce((s, r) => s + Number(r.stockValue), 0);
    return { rows: mapped, totalValue: total.toFixed(6) };
  }

  /** Movement history, newest first, optionally narrowed to an item and/or warehouse. */
  async ledger(opts: { itemCode?: string; warehouse?: string; limit?: number } = {}): Promise<StockLedgerRow[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (opts.itemCode) {
      params.push(opts.itemCode);
      conds.push(`item_code = $${params.length}`);
    }
    if (opts.warehouse) {
      params.push(opts.warehouse);
      conds.push(`warehouse = $${params.length}`);
    }
    params.push(Math.min(opts.limit ?? 200, 1000));
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = (await AppDataSource.query(
      `SELECT posting_date, item_code, warehouse, actual_qty, incoming_rate, outgoing_rate,
              qty_after_transaction, valuation_rate, stock_value, stock_value_difference,
              voucher_type, voucher_no
         FROM stock_ledger_entry ${where}
        ORDER BY seq DESC
        LIMIT $${params.length}`,
      params,
    )) as Record<string, unknown>[];

    return rows.map((r) => ({
      postingDate: String(r.posting_date),
      itemCode: String(r.item_code),
      warehouse: String(r.warehouse),
      actualQty: String(r.actual_qty),
      incomingRate: (r.incoming_rate as string) ?? null,
      outgoingRate: (r.outgoing_rate as string) ?? null,
      qtyAfterTransaction: String(r.qty_after_transaction),
      valuationRate: String(r.valuation_rate),
      stockValue: String(r.stock_value),
      stockValueDifference: String(r.stock_value_difference),
      voucherType: String(r.voucher_type),
      voucherNo: String(r.voucher_no),
    }));
  }

  /**
   * Do the warehouse and the books agree? Under perpetual inventory the Stock In Hand
   * balance must equal what the stock ledger says is on hand — if they drift, one of
   * them is lying and the balance sheet is wrong.
   *
   * The stock side is summed from stock_value_difference rather than from the latest
   * balance per (item, warehouse): the GL received one posting per movement, so the
   * two sides are compared on the same basis, and a zeroed-out item still counts.
   *
   * A difference is reported alongside the stock vouchers that produced no GL entry,
   * which is nearly always the reason for it.
   */
  async reconciliation(): Promise<StockReconciliationRow> {
    const [totals] = (await AppDataSource.query(
      `SELECT
         (SELECT COALESCE(SUM(stock_value_difference), 0) FROM stock_ledger_entry)      AS sl_value,
         (SELECT COALESCE(SUM(debit - credit), 0) FROM gl_entry WHERE account = $1)     AS gl_value`,
      [STOCK_ACCOUNT],
    )) as { sl_value: string; gl_value: string }[];

    const sl = new Decimal(totals?.sl_value ?? 0);
    const gl = new Decimal(totals?.gl_value ?? 0);
    const difference = sl.minus(gl);

    // Vouchers that moved value but never reached the GL. A transfer nets to zero, so
    // grouping by voucher (not by row) keeps its two legs from showing up as a gap.
    const unposted = (await AppDataSource.query(
      `SELECT sle.voucher_type, sle.voucher_no, SUM(sle.stock_value_difference) AS value_diff
         FROM stock_ledger_entry sle
        WHERE NOT EXISTS (
                SELECT 1 FROM gl_entry g
                 WHERE g.voucher_type = sle.voucher_type AND g.voucher_no = sle.voucher_no)
        GROUP BY sle.voucher_type, sle.voucher_no
       HAVING SUM(sle.stock_value_difference) <> 0
        ORDER BY MIN(sle.seq)`,
    )) as Record<string, unknown>[];

    return {
      stockLedgerValue: sl.toFixed(6),
      generalLedgerValue: gl.toFixed(6),
      difference: difference.toFixed(6),
      inSync: difference.isZero(),
      unpostedVouchers: unposted.map((r) => ({
        voucherType: String(r.voucher_type),
        voucherNo: String(r.voucher_no),
        stockValueDifference: String(r.value_diff),
      })),
    };
  }
}

export const stockReportService = new StockReportService();
