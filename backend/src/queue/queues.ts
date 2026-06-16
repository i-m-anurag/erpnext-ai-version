import { Queue } from 'bullmq';
import { queueConnection } from './connection.js';

export const EMAIL_QUEUE = 'email';
export const EVENT_QUEUE = 'events';

const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: 200,
  removeOnFail: 1000,
};

/** Async email send. Payload = template slug + recipient + variables. */
export interface EmailJob {
  slug: string;
  to: string;
  vars: Record<string, string | number>;
}

/** Lazily-created singletons so importing this module doesn't open connections
 *  until something actually enqueues (keeps test/CLI imports cheap). */
let _emailQueue: Queue<EmailJob> | undefined;
let _eventQueue: Queue | undefined;

export function emailQueue(): Queue<EmailJob> {
  return (_emailQueue ??= new Queue<EmailJob>(EMAIL_QUEUE, { connection: queueConnection }));
}
export function eventQueue(): Queue {
  return (_eventQueue ??= new Queue(EVENT_QUEUE, { connection: queueConnection }));
}

export async function enqueueEmail(job: EmailJob): Promise<void> {
  await emailQueue().add('send', job, defaultJobOpts);
}

export { defaultJobOpts };
