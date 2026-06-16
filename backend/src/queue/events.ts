import { defaultJobOpts, eventQueue } from './queues.js';

/**
 * A domain event emitted after a record changes. Consumed asynchronously by the
 * worker, which dispatches to handlers (email triggers, assignment rules,
 * derived timeline). Emitted AFTER the DB commit so the transaction stays fast
 * and durable (the queue add is a single sub-ms Redis call).
 */
export interface DomainEvent {
  type: 'master.created' | 'master.updated' | 'master.state_changed';
  /** the backing master slug (entity type) */
  entityType: string;
  /** the record's natural code */
  recordId: string;
  actorUserId: string | null;
  data?: Record<string, unknown>;
  fromState?: string;
  toState?: string;
}

export async function publish(event: DomainEvent): Promise<void> {
  await eventQueue().add(event.type, event, defaultJobOpts);
}
