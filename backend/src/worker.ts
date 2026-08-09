import 'reflect-metadata';
import { Worker } from 'bullmq';
import { AppDataSource } from './db/data-source.js';
import { connectRedis, redis } from './db/redis.js';
import { logger } from './config/logger.js';
import { registerAllResourceTypes } from './db/seeds/register-resources.js';
import { queueConnection } from './queue/connection.js';
import { EMAIL_QUEUE, EVENT_QUEUE, type EmailJob } from './queue/queues.js';
import type { DomainEvent } from './queue/events.js';
import { emailService, notificationService } from './modules/communication/index.js';
import { activityService } from './modules/activity/index.js';
import { integrationLogService } from './modules/integration/index.js';
import { env } from './config/env.js';

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
      const e = job.data;
      logger.info({ type: e.type, entity: e.entityType, record: e.recordId }, 'worker: domain event');

      // On a state change, tell the record's creator (requester) — in-app now; the
      // email channel is logged only in this phase (dispatch is a TODO in NotificationService).
      if (e.type === 'master.state_changed' && e.toState) {
        const creatorId = await activityService.creatorOf(e.entityType, e.recordId);
        if (creatorId) {
          const context = { entityType: e.entityType, recordId: e.recordId, purpose: 'state_changed' };
          await notificationService.notify({
            channel: 'in_app',
            recipients: [{ userId: creatorId }],
            title: `${e.recordId} → ${e.toState}`,
            body: `${e.entityType} ${e.recordId} moved from ${e.fromState ?? '?'} to ${e.toState}.`,
            context,
          });
          // TODO(comms): also notify via email once the email channel dispatches.
        }
      }
    },
    { connection: queueConnection, concurrency: 5 },
  );

  emailWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'worker: email job failed'));
  eventWorker.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, 'worker: event job failed'));
  logger.info('worker: listening on queues [email, events]');

  // Periodically archive old API call logs so the live table (and Admin viewer)
  // stays clean. Runs on startup, then daily.
  if (env.integrations.logs.archiveEnabled) {
    const days = env.integrations.logs.retentionDays;
    const archive = async (): Promise<void> => {
      try {
        const n = await integrationLogService.archiveOlderThan(days);
        if (n > 0) logger.info(`worker: archived ${n} api_call_log rows older than ${days}d`);
      } catch (err) {
        logger.warn({ err }, 'worker: api_call_log archive failed');
      }
    };
    await archive();
    setInterval(() => void archive(), 24 * 60 * 60 * 1000);
    logger.info(`worker: api_call_log archival scheduled (retention ${days}d)`);
  }

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
