import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * A single grantable capability at (module, action) granularity (§5.4),
 * e.g. ('master','item.create'), ('workflow','po.approve'). The effective
 * permission snapshot represents each as the string `module:action`.
 */
@Entity('permissions')
@Unique('uq_permission_module_action', ['module', 'action'])
export class Permission extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  module!: string;

  @Column({ type: 'varchar', length: 128 })
  action!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  /** Canonical snapshot key. */
  get key(): string {
    return `${this.module}:${this.action}`;
  }
}
