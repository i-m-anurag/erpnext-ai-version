import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * Generic master-data store (§5.5). One table holds rows for every master,
 * keyed by `masterSlug`. The full row payload lives in `data` (jsonb, validated
 * against the master's form definition on write); `code` is the row's natural key
 * (registry.codeField), unique within a master and used as the dropdown value.
 */
@Entity('master_data')
@Unique('uq_master_data', ['masterSlug', 'code'])
@Index('idx_master_data_slug', ['masterSlug'])
export class MasterData extends BaseEntity {
  @Column({ name: 'master_slug', type: 'varchar', length: 64 })
  masterSlug!: string;

  @Column({ type: 'varchar', length: 128 })
  code!: string;

  @Column({ type: 'jsonb' })
  data!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'archived';
}
