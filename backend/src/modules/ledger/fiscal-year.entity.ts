import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * A fiscal (financial) year — the reporting window for the accounts. Dates are
 * free-form so non-calendar years work (e.g. Apr 1 – Mar 31). `closed` is set by
 * year-end closing, which sweeps the year's profit into Retained Earnings.
 */
@Entity('fiscal_year')
@Unique('uq_fiscal_year_name', ['name'])
@Index('idx_fiscal_year_range', ['startDate', 'endDate'])
export class FiscalYear extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  name!: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'boolean', default: false })
  closed!: boolean;
}
