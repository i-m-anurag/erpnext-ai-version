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
}

export const stockReportService = new StockReportService();
