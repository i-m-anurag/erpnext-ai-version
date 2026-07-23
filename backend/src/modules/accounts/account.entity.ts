import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/** The five root buckets of any chart of accounts. */
export type RootType = 'Asset' | 'Liability' | 'Income' | 'Expense' | 'Equity';

/** Semantic role of a leaf account — lets posting rules resolve accounts by role
 *  (e.g. "the Payable account") rather than a hard-coded code. Null for plain accounts. */
export type AccountType =
  | 'Payable'
  | 'Receivable'
  | 'Cash'
  | 'Bank'
  | 'Stock'
  | 'Stock Received But Not Billed'
  | 'Stock Adjustment'
  | 'Tax'
  | 'Cost of Goods Sold'
  | null;

/**
 * A node in the Chart of Accounts (single company). Group nodes (`isGroup`) are
 * branches that hold children and are NOT postable; leaf nodes receive GL entries.
 * The tree is expressed by `parentCode` → parent `code`.
 */
@Entity('account')
@Unique('uq_account_code', ['code'])
@Index('idx_account_parent', ['parentCode'])
export class Account extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 140 })
  name!: string;

  @Column({ name: 'parent_code', type: 'varchar', length: 64, nullable: true })
  parentCode!: string | null;

  @Column({ name: 'root_type', type: 'varchar', length: 16 })
  rootType!: RootType;

  @Column({ name: 'account_type', type: 'varchar', length: 32, nullable: true })
  accountType!: AccountType;

  @Column({ name: 'is_group', type: 'boolean', default: false })
  isGroup!: boolean;
}
