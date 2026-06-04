import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

export type UserStatus = 'active' | 'disabled';

/**
 * Application user. `passwordHash` is null for seeded users who have not yet set
 * a password via the welcome link (§5.2). Roles/permissions are assigned in the
 * permission module (Step 6); auth only knows identity + credentials + status.
 */
@Entity('users')
export class User extends BaseEntity {
  @Index('uq_users_username', { unique: true })
  @Column({ type: 'varchar', length: 128 })
  username!: string;

  @Index('uq_users_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName!: string | null;

  /** Argon2id hash. Null until the user sets a password via welcome/reset. */
  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: UserStatus;

  /** True until the user completes the first-login set-password flow. */
  @Column({ name: 'is_first_login', type: 'boolean', default: true })
  isFirstLogin!: boolean;

  /** Force a password change on next login (e.g. admin reset). */
  @Column({ name: 'must_change_password', type: 'boolean', default: false })
  mustChangePassword!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
