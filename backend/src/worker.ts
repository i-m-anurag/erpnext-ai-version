import 'reflect-metadata';
import { Worker } from 'bullmq';
import { AppDataSource } from './db/data-source.js';
import { connectRedis, redis } from './db/redis.js';
import { logger } from './config/logger.js';
import { registerAllResourceTypes } from './db/seeds/register-resources.js';
import { queueConnection } from './queue/connection.js';
import { EMAIL_QUEUE, EVENT_QUEUE, type EmailJob } from './queue/queues.js';
import type { DomainEvent } from './queue/events.js';
import { emailService } from './modules/communication/index.js';

/**
 * Background worker process. Consumes async jobs so the request path stays fast:
 *   - `email`  → render + send a templated email (Mailhog in dev).
 *   - `events` → domain-event dispatcher; email-trigger and assignment-rule
 *                handlers attach here in later increments (currently logs).
 * Run separately from the API: `npm run worker`.
 */
async function main(): Promise<void> {
  registerAllResourceTypes();
  await AppDataSource.initialize();
  await connectRedis();
  logger.info('worker: db + redis connected');

  const emailWorker = new Worker<EmailJob>(
    EMAIL_QUEUE,
    async (job) => {
      await emailService.send(job.data.slug, job.data.to, job.data.vars);
      logger.info({ to: job.data.to, slug: job.data.slug }, 'worker: email sent');
    },
    { connection: queueConnection, concurrency: 5 },
  );

  const eventWorker = new Worker<DomainEvent>(
    EVENT_QUEUE,
    async (job) => {
      // Dispatcher seam: email triggers + assignment rules handle events here next.
      logger.info(
        { type: job.data.type, entity: job.data.entityType, record: job.data.recordId },
        'worker: domain event',
      );
    },
    { connection: queueConnection, concurrency: 5 },
  );

  emailWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'worker: email job failed'));
  eventWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'worker: event job failed'));
  logger.info('worker: listening on queues [email, events]');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`worker: ${signal} received — shutting down`);
    await emailWorker.close();
    await eventWorker.close();
    await AppDataSource.destroy().catch(() => undefined);
    await redis.quit().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'worker failed to start');
  process.exit(1);
});
