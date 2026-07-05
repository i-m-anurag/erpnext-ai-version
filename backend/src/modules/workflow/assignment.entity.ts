import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * A record assigned to a user by an `assign` workflow action. Keyed by
 * (entityType, recordId); drives a "My assignments" worklist. `status` closes
 * when the work is done (or a later rule reassigns/closes it).
 */
@Entity('assignments')
@Index('idx_assignments_assignee', ['assigneeUserId', 'status'])
@Index('idx_assignments_record', ['entityType', 'recordId'])
export class Assignment extends BaseEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'record_id', type: 'varchar', length: 128 })
  recordId!: string;

  @Column({ name: 'assignee_user_id', type: 'uuid' })
  assigneeUserId!: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'closed';

  @Column({ name: 'rule_name', type: 'varchar', length: 128, nullable: true })
  ruleName!: string | null;

  /** The role this task was assigned as (e.g. Approver) — "track over roles". */
  @Column({ type: 'varchar', length: 64, nullable: true })
  role!: string | null;

  /** The workflow state/step this assignment belongs to. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  state!: string | null;

  /** Who created the assignment (a user id, or null when the engine did). */
  @Column({ name: 'assigned_by_user_id', type: 'uuid', nullable: true })
  assignedByUserId!: string | null;

  /** When the assignment was closed (status → 'closed'). */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;
}
