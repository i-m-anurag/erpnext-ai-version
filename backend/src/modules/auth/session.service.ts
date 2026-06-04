import { randomUUID } from 'node:crypto';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import type { SessionData } from './auth.types.js';

const sessionKey = (id: string): string => `sess:${id}`;
const userIndexKey = (userId: string): string => `user:sessions:${userId}`;

export interface CreateSessionInput {
  userId: string;
  currentRefreshJti: string;
  permissions?: string[];
  branchId?: string | null;
  ip?: string;
  device?: string;
}

/**
 * Server-side session store in Redis (§5.8). Sessions carry the permission
 * snapshot, branch context, and refresh-token jti. Lifecycle = sliding idle
 * timeout (key TTL, extended on touch) bounded by an absolute max lifetime.
 * Sessions are killable on demand by dropping the key (logout / password change
 * / admin / refresh-reuse).
 */
export class SessionService {
  /**
   * Create a session. If concurrent sessions are disabled for the deployment,
   * all existing sessions for the user are revoked first (single active session).
   */
  async create(input: CreateSessionInput): Promise<{ sessionId: string; data: SessionData }> {
    if (!env.auth.concurrentSessions) {
      await this.revokeAllForUser(input.userId);
    }

    const sessionId = randomUUID();
    const now = Date.now();
    const data: SessionData = {
      userId: input.userId,
      currentRefreshJti: input.currentRefreshJti,
      permissions: input.permissions ?? [],
      branchId: input.branchId ?? null,
      createdAt: now,
      absoluteExpiresAt: now + env.auth.sessionAbsoluteTimeout * 1000,
      lastSeenAt: now,
      ip: input.ip,
      device: input.device,
    };

    await redis
      .multi()
      .set(sessionKey(sessionId), JSON.stringify(data), 'EX', env.auth.sessionIdleTimeout)
      .sadd(userIndexKey(input.userId), sessionId)
      // index lives at least as long as the absolute lifetime
      .expire(userIndexKey(input.userId), env.auth.sessionAbsoluteTimeout)
      .exec();

    return { sessionId, data };
  }

  /** Load a session, enforcing the absolute lifetime. Returns null if absent/expired. */
  async get(sessionId: string): Promise<SessionData | null> {
    const raw = await redis.get(sessionKey(sessionId));
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    if (Date.now() >= data.absoluteExpiresAt) {
      await this.revoke(sessionId);
      return null;
    }
    return data;
  }

  /** Slide the idle window forward and update last-seen. */
  async touch(sessionId: string, data: SessionData): Promise<void> {
    data.lastSeenAt = Date.now();
    await redis.set(sessionKey(sessionId), JSON.stringify(data), 'EX', env.auth.sessionIdleTimeout);
  }

  /** Persist a mutated session (e.g. after refresh-jti rotation) and slide idle window. */
  async update(sessionId: string, data: SessionData): Promise<void> {
    await redis.set(sessionKey(sessionId), JSON.stringify(data), 'EX', env.auth.sessionIdleTimeout);
  }

  async revoke(sessionId: string): Promise<void> {
    const raw = await redis.get(sessionKey(sessionId));
    if (raw) {
      const { userId } = JSON.parse(raw) as SessionData;
      await redis.srem(userIndexKey(userId), sessionId);
    }
    await redis.del(sessionKey(sessionId));
  }

  /** Revoke every session for a user (password change, admin action, single-session login). */
  async revokeAllForUser(userId: string): Promise<void> {
    const ids = await redis.smembers(userIndexKey(userId));
    if (ids.length) {
      await redis.del(...ids.map(sessionKey));
    }
    await redis.del(userIndexKey(userId));
  }

  /**
   * Replace the permission snapshot across all of a user's live sessions —
   * called by the permission module when roles change (§5.8). Prunes stale
   * index entries as it goes.
   */
  async refreshPermissionsForUser(userId: string, permissions: string[]): Promise<void> {
    const ids = await redis.smembers(userIndexKey(userId));
    for (const id of ids) {
      const raw = await redis.get(sessionKey(id));
      if (!raw) {
        await redis.srem(userIndexKey(userId), id);
        continue;
      }
      const data = JSON.parse(raw) as SessionData;
      data.permissions = permissions;
      await this.update(id, data);
    }
  }
}

export const sessionService = new SessionService();
