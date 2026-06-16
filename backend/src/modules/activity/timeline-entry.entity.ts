import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

export type TimelineKind =
  | 'created'
  | 'updated'
  | 'state_changed'
  | 'assigned'
  | 'commented'
  | 'email_sent';

/**
 * Generic activity timeline, keyed by (entityType, recordId) so any record —
 * master rows today, documents later — can have an audit/activity feed. Written
 * by the modules that act on a record (master writes, workflow, assignment).
 */
@Entity('timeline_entries')
@Index('idx_timeline_record', ['entityType', 'recordId'])
export class TimelineEntry extends BaseEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'record_id', type: 'varchar', length: 128 })
  recordId!: string;

  @Column({ type: 'varchar', length: 24 })
  kind!: TimelineKind;

  @Column({ type: 'varchar', length: 512 })
  summary!: string;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;
}
