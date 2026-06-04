import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';
import type { ConfigScope } from './config.types.js';

/**
 * Backing store for the generic config-resolution pipeline (§3.4). Every
 * configurable resource — form, email template, master schema, workflow — is a
 * row here, distinguished by `resourceType`. `scope` separates the shipped
 * baseline ('base') from the client's customization ('custom'); the resolver
 * merges them into the effective definition.
 *
 * One current row per (resourceType, slug, scope). `version` bumps on every edit
 * and lets in-flight documents pin to the version they were created with.
 */
@Entity('config_resources')
@Unique('uq_config_resource', ['resourceType', 'slug', 'scope'])
@Index('idx_config_resource_lookup', ['resourceType', 'slug'])
export class ConfigResource extends BaseEntity {
  @Column({ name: 'resource_type', type: 'varchar', length: 64 })
  resourceType!: string;

  @Column({ type: 'varchar', length: 128 })
  slug!: string;

  @Column({ type: 'varchar', length: 16 })
  scope!: ConfigScope;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'jsonb' })
  definition!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'draft' | 'archived';
}
