import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Shared Redis connection — used for the config-resolution cache, session store,
 * and permission-set caching (see §5.8/§5.9 of the implementation doc).
 */
export const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  lazyConnect: true,
  maxRetriesPerRequest: 2,
});

redis.on('error', (err) => logger.error({ err }, 'redis error'));
redis.on('connect', () => logger.info('redis connected'));

export async function connectRedis(): Promise<void> {
  if (redis.status === 'ready' || redis.status === 'connecting') return;
  await redis.connect();
}
