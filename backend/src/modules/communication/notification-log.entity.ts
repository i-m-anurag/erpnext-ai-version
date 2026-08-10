import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * Delivery audit for every notification the system decides to send, across all
 * channels. Answers "was the approval notice actually sent?" and powers dedupe:
 * a row per (channel, recipient, purpose, record) so a retried transition never
 * notifies twice. Written by NotificationService.notify().
 *
 * NOTE (this phase): the email channel is NOT dispatched yet — rows are recorded
 * with status `queued` and a TODO marks where real sending will be wired.
 */
@Entity('notification_log')
@Index('idx_notiflog_record', ['entityType', 'recordId'])
@Index('uq_notiflog_dedupe', ['dedupeKey'], { unique: true, where: '"dedupe_key" IS NOT NULL' })
export class NotificationLog extends BaseEntity {
  @Column({ name: 'channel', type: 'varchar', length: 16 })
  channel!: 'email' | 'in_app';

  @Column({ name: 'template', type: 'varchar', length: 128, nullable: true })
  template!: string | null;

  /** Email address (email channel) or user id (in_app channel). */
  @Column({ name: 'recipient', type: 'varchar', length: 255 })
  recipient!: string;

  @Column({ name: 'subject', type: 'varchar', length: 255, nullable: true })
  subject!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'queued' })
  status!: 'queued' | 'sent' | 'failed' | 'skipped';

  @Column({ name: 'error', type: 'text', nullable: true })
  error!: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 64, nullable: true })
  entityType!: string | null;

  @Column({ name: 'record_id', type: 'varchar', length: 128, nullable: true })
  recordId!: string | null;

  /** What this notification is FOR (e.g. "assigned", "state_changed") — part of the dedupe key. */
  @Column({ name: 'purpose', type: 'varchar', length: 64, nullable: true })
  purpose!: string | null;

  /** Unique idempotency key; a duplicate notify() with the same key is skipped. */
  @Column({ name: 'dedupe_key', type: 'varchar', length: 255, nullable: true })
  dedupeKey!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
}
