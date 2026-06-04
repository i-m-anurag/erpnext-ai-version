import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';
import { Role } from './role.entity.js';
import { Permission } from './permission.entity.js';

/** role ↔ permission mapping (§5.4). */
@Entity('role_permissions')
@Unique('uq_role_permission', ['roleId', 'permissionId'])
export class RolePermission extends BaseEntity {
  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId!: string;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Permission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission!: Permission;
}
