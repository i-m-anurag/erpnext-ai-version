import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

export type RoleStatus = 'active' | 'disabled';

/**
 * A role defined for this deployment. System roles are shipped/seeded and
 * protected from deletion; non-system roles are created by admins.
 */
@Entity('roles')
export class Role extends BaseEntity {
  @Index('uq_roles_code', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** Shipped/system role — cannot be deleted via the UI. */
  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: RoleStatus;
}
