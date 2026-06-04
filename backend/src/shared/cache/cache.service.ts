import { redis } from '../../db/redis.js';
import { logger } from '../../config/logger.js';

/**
 * Cache-aside with stampede (thundering-herd) protection — implements the
 * get(key) pattern from §5.9 of the implementation doc:
 *
 *   - read the key; on hit, return it
 *   - on miss, try to acquire a short SETNX lock
 *       - lock won  → build from source, cache, release lock
 *       - lock lost → another builder is in flight; wait briefly and re-read
 *
 * If Redis is unreachable the cache degrades to a direct build (read-through
 * still works, just uncached) rather than failing the request.
 */
export interface CacheOptions {
  /** time-to-live for the cached value, in seconds */
  ttlSeconds: number;
  /** how long the build lock is held before it auto-expires, in seconds */
  lockTtlSeconds?: number;
  /** how many times a waiter re-reads the key before building itself */
  waitRetries?: number;
  /** delay between waiter re-reads, in milliseconds */
  waitDelayMs?: number;
}

const DEFAULTS = { lockTtlSeconds: 10, waitRetries: 20, waitDelayMs: 100 } as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class CacheService {
  /**
   * Return the cached value for `key`, or build it via `build()`, cache it, and
   * return it — with stampede protection so concurrent misses don't all hit the
   * source.
   */
  async getOrBuild<T>(key: string, build: () => Promise<T>, opts: CacheOptions): Promise<T> {
    const lockTtl = opts.lockTtlSeconds ?? DEFAULTS.lockTtlSeconds;
    const waitRetries = opts.waitRetries ?? DEFAULTS.waitRetries;
    const waitDelayMs = opts.waitDelayMs ?? DEFAULTS.waitDelayMs;

    const hit = await this.safeGet<T>(key);
    if (hit !== undefined) return hit;

    const lockKey = `${key}:lock`;
    const acquired = await this.safeLock(lockKey, lockTtl);

    if (acquired) {
      try {
        const value = await build();
        await this.safeSet(key, value, opts.ttlSeconds);
        return value;
      } finally {
        await this.safeDel(lockKey);
      }
    }

    // Another worker is building — wait and re-read instead of piling on.
    for (let i = 0; i < waitRetries; i++) {
      await sleep(waitDelayMs);
      const again = await this.safeGet<T>(key);
      if (again !== undefined) return again;
    }

    // Builder seems stuck or failed; build ourselves rather than hang.
    logger.warn({ key }, 'cache build wait timed out; building without lock');
    const value = await build();
    await this.safeSet(key, value, opts.ttlSeconds);
    return value;
  }

  /** Invalidate a single key (and any stale build lock). */
  async invalidate(key: string): Promise<void> {
    await this.safeDel(key);
    await this.safeDel(`${key}:lock`);
  }

  /** Invalidate every key matching a glob pattern (e.g. `cfg:form:*`). */
  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const stream = redis.scanStream({ match: pattern, count: 200 });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length) await redis.del(...keys);
      }
    } catch (err) {
      logger.error({ err, pattern }, 'cache invalidatePattern failed');
    }
  }

  private async safeGet<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await redis.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch (err) {
      logger.error({ err, key }, 'cache get failed; treating as miss');
      return undefined;
    }
  }

  private async safeSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (err) {
      logger.error({ err, key }, 'cache set failed');
    }
  }

  private async safeLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    try {
      const res = await redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
      return res === 'OK';
    } catch (err) {
      // If we can't talk to Redis, behave as if we won the lock so the caller
      // builds directly (uncached) instead of stalling.
      logger.error({ err, lockKey }, 'cache lock failed; proceeding to build');
      return true;
    }
  }

  private async safeDel(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (err) {
      logger.error({ err, key }, 'cache del failed');
    }
  }
}

export const cache = new CacheService();
