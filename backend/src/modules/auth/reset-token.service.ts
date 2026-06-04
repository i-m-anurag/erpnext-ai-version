import { createHash, randomBytes } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { AppDataSource } from '../../db/data-source.js';
import { env } from '../../config/env.js';
import { PasswordResetToken, type ResetTokenType } from './password-reset-token.entity.js';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Issues and consumes single-use, expiring tokens for the welcome (set-password)
 * and forgot-password flows. Only the hash is stored; the raw token is returned
 * once for emailing and never persisted.
 */
export class ResetTokenService {
  private readonly repo = new BaseRepository(PasswordResetToken);

  /** Create a token for a user, invalidating any prior unused tokens of the same type. */
  async issue(userId: string, type: ResetTokenType, manager?: EntityManager): Promise<string> {
    const repo = manager ? this.repo.withManager(manager) : this.repo;
    const raw = randomBytes(32).toString('hex');
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + env.auth.passwordResetTtl * 1000);

    await repo.save(repo.create({ userId, type, tokenHash, expiresAt, usedAt: null }));
    return raw;
  }

  /** Resolve a raw token to its (valid, unused, unexpired) record, or null. */
  async validate(raw: string): Promise<PasswordResetToken | null> {
    const token = await this.repo.findOne({ tokenHash: sha256(raw) });
    if (!token) return null;
    if (token.usedAt) return null;
    if (Date.now() >= token.expiresAt.getTime()) return null;
    return token;
  }

  /** Mark a token used (single-use). Run inside the same tx as the password write. */
  async consume(tokenId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(PasswordResetToken).update(tokenId, { usedAt: new Date() });
  }

  transaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return AppDataSource.transaction(fn);
  }
}

export const resetTokenService = new ResetTokenService();
