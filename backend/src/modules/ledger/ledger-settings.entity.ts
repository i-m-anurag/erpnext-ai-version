import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Single-row ledger settings. `freezeDate` locks the accounting period: no GL entry
 * may be posted with a posting date on or before it (prevents back-dating into a
 * closed period). Null = no freeze.
 */
@Entity('ledger_settings')
export class LedgerSettings {
  /** Fixed id — there is only ever one row. */
  @PrimaryColumn({ type: 'varchar', length: 16, default: 'singleton' })
  id!: string;

  @Column({ name: 'freeze_date', type: 'timestamptz', nullable: true })
  freezeDate!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
