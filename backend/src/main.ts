import 'reflect-metadata';
import { createApp } from './app.js';
import { AppDataSource } from './db/data-source.js';
import { connectRedis, redis } from './db/redis.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { registerAllResourceTypes } from './db/seeds/register-resources.js';

async function bootstrap(): Promise<void> {
  // Register configurable resource types (forms, …) before serving requests.
  registerAllResourceTypes();

  await AppDataSource.initialize();
  logger.info('database connected');

  await connectRedis();

  const app = createApp();
  const server = app.listen(env.app.port, () => {
    logger.info(`API listening on http://localhost:${env.app.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down`);
    server.close();
    await AppDataSource.destroy().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'failed to start');
  process.exit(1);
});
