import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * A single line of the financial ledger — one side of a double-entry posting.
 * **Append-only and immutable**: the DB (see migration) blocks UPDATE/DELETE/TRUNCATE
 * with triggers, so a posted row can never change. Corrections are *reversal* entries,
 * never edits. Deliberately NOT `BaseEntity` (no updatedAt / deletedAt / soft-delete).
 */
@Entity('gl_entry')
@Index('idx_gl_account', ['account'])
@Index('idx_gl_voucher', ['voucherType', 'voucherNo'])
export class GlEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Monotonic insert order (DB `GENERATED ALWAYS AS IDENTITY`) — deterministic report
   *  ordering and the forward-compat hook for a future hash chain. Read-only here. */
  @Column({ type: 'bigint', insert: false, update: false })
  seq!: string;

  @Column({ name: 'posting_date', type: 'timestamptz' })
  postingDate!: Date;

  /** The account code this line posts to (references account.code). */
  @Column({ type: 'varchar', length: 64 })
  account!: string;

  @Column({ type: 'numeric', precision: 21, scale: 6, default: 0 })
  debit!: string;

  @Column({ type: 'numeric', precision: 21, scale: 6, default: 0 })
  credit!: string;

  /** The document type + code that produced this posting (idempotency key). */
  @Column({ name: 'voucher_type', type: 'varchar', length: 64 })
  voucherType!: string;

  @Column({ name: 'voucher_no', type: 'varchar', length: 128 })
  voucherNo!: string;

  /** Party (supplier/customer) code, when the line is a receivable/payable. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  party!: string | null;

  /** Human-readable "against" summary (the other side of the entry) for GL reports. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  against!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remarks!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
