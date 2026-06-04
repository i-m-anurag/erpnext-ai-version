import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';
import { Role } from './role.entity.js';
import { User } from '../auth/user.entity.js';

/** user ↔ role assignment (§5.4). */
@Entity('user_roles')
@Unique('uq_user_role', ['userId', 'roleId'])
export class UserRole extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Role, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role!: Role;
}
