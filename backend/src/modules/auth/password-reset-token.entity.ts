import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';
import { User } from './user.entity.js';

export type ResetTokenType = 'welcome' | 'reset';

/**
 * Single-use, expiring token backing both the first-login welcome flow and the
 * forgot-password flow (§5.2). Only the SHA-256 hash of the token is stored; the
 * raw token is emailed to the user and never persisted.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Index('idx_reset_token_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: ResetTokenType;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
