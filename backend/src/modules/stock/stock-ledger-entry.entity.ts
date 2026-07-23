import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * One stock movement — the inventory counterpart of {@link GlEntry}.
 * **Append-only and immutable**: the DB blocks UPDATE/DELETE/TRUNCATE with triggers,
 * so corrections are reversing entries (negative qty), never edits.
 *
 * The ledger key is (itemCode, warehouse); `seq` orders movements within that key.
 * Back-dating is rejected by the service, so insert order == chronological order —
 * which is why the running balances below never need recomputing.
 */
@Entity('stock_ledger_entry')
@Index('idx_sle_item_warehouse', ['itemCode', 'warehouse', 'seq'])
@Index('idx_sle_voucher', ['voucherType', 'voucherNo'])
export class StockLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Monotonic insert order (DB `GENERATED ALWAYS AS IDENTITY`) — defines sequence
   *  within an (item, warehouse) and gives deterministic report ordering. */
  @Column({ type: 'bigint', insert: false, update: false })
  seq!: string;

  @Column({ name: 'posting_date', type: 'timestamptz' })
  postingDate!: Date;

  @Column({ name: 'item_code', type: 'varchar', length: 128 })
  itemCode!: string;

  @Column({ type: 'varchar', length: 128 })
  warehouse!: string;

  /** Signed quantity change: positive = receipt into stock, negative = issue out. */
  @Column({ name: 'actual_qty', type: 'numeric', precision: 21, scale: 6 })
  actualQty!: string;

  /** Unit cost of the incoming units (receipts only). */
  @Column({ name: 'incoming_rate', type: 'numeric', precision: 21, scale: 6, nullable: true })
  incomingRate!: string | null;

  /** Unit cost the outgoing units were consumed at — derived, not supplied. */
  @Column({ name: 'outgoing_rate', type: 'numeric', precision: 21, scale: 6, nullable: true })
  outgoingRate!: string | null;

  /** Running quantity balance for (item, warehouse) AFTER this movement. */
  @Column({ name: 'qty_after_transaction', type: 'numeric', precision: 21, scale: 6 })
  qtyAfterTransaction!: string;

  /** Per-unit value of the remaining balance after this movement (moving average). */
  @Column({ name: 'valuation_rate', type: 'numeric', precision: 21, scale: 6, default: 0 })
  valuationRate!: string;

  /** Running value balance = qtyAfterTransaction × valuationRate. */
  @Column({ name: 'stock_value', type: 'numeric', precision: 21, scale: 6, default: 0 })
  stockValue!: string;

  /** stockValue − previous stockValue. The ONLY figure that may post to the GL —
   *  deriving the accounting entry from this is what keeps SL and GL in agreement. */
  @Column({ name: 'stock_value_difference', type: 'numeric', precision: 21, scale: 6, default: 0 })
  stockValueDifference!: string;

  /** The document type + code that produced this movement (idempotency key). */
  @Column({ name: 'voucher_type', type: 'varchar', length: 64 })
  voucherType!: string;

  @Column({ name: 'voucher_no', type: 'varchar', length: 128 })
  voucherNo!: string;

  /** The document LINE this movement came from, so every row traces to one row. */
  @Column({ name: 'voucher_detail_no', type: 'varchar', length: 64, nullable: true })
  voucherDetailNo!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
