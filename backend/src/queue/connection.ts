import type { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

/**
 * BullMQ Redis connection options. Separate from the shared app `redis` because
 * BullMQ's blocking commands require `maxRetriesPerRequest: null`.
 */
export const queueConnection: ConnectionOptions = {
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password,
  db: env.redis.db,
  maxRetriesPerRequest: null,
};
