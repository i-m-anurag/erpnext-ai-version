import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

export type MasterManagedBy = 'seeded' | 'ui';

/**
 * Describes each master (§5.5): whether it's seeded (read-only in UI) or
 * UI-managed (full CRUD), and which form drives its editor. Adding a master =
 * insert a row here + define its form — no bespoke screens. The CHECK constraint
 * enforces slug naming (lowercase, hyphenated).
 */
@Entity('master_registry')
@Check('chk_master_slug', "slug ~ '^[a-z][a-z0-9-]*$'")
export class MasterRegistry extends BaseEntity {
  @Index('uq_master_registry_slug', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ name: 'managed_by', type: 'varchar', length: 16 })
  managedBy!: MasterManagedBy;

  /** Whether rows can be edited through the UI (seeded masters are read-only). */
  @Column({ type: 'boolean', default: true })
  editable!: boolean;

  /** Slug of the form definition used to create/edit rows of this master. */
  @Column({ name: 'form_slug', type: 'varchar', length: 128, nullable: true })
  formSlug!: string | null;

  /** Which data field is the row's natural key (option value + uniqueness). */
  @Column({ name: 'code_field', type: 'varchar', length: 64, default: 'code' })
  codeField!: string;

  /** Which data field is the human label (option label). */
  @Column({ name: 'label_field', type: 'varchar', length: 64, default: 'name' })
  labelField!: string;

  /** Cache TTL (seconds) for this master's resolved option data. */
  @Column({ name: 'cache_ttl_seconds', type: 'int', default: 3600 })
  cacheTtlSeconds!: number;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'archived';
}
