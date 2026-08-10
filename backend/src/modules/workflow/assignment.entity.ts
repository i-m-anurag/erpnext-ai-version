import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * A record assigned to a user by an `assign` workflow action. Keyed by
 * (entityType, recordId); drives a "My Work" worklist.
 *
 * Append-only history: assignments are never deleted — they are `closed`. The rows
 * for a record, ordered by `createdAt`, ARE the assignment history (Requester →
 * Approver → …), mirroring the append-only discipline used for the ledger. `role`
 * and `state` record the *context* an assignment was created in (assigned AS which
 * role, in WHICH workflow state); `assignedByUserId` is who/what created it (a user,
 * or the workflow itself when null). `closedAt` stamps when the step finished.
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

  /** Which role the task was assigned AS (e.g. "approver") — enables tracking a
   *  record across the different roles it passes through. */
  @Column({ name: 'role', type: 'varchar', length: 64, nullable: true })
  role!: string | null;

  /** The workflow state/step this assignment belongs to (e.g. "Pending Approval"). */
  @Column({ name: 'state', type: 'varchar', length: 128, nullable: true })
  state!: string | null;

  /** Who triggered the assignment; null = created by the workflow engine itself. */
  @Column({ name: 'assigned_by_user_id', type: 'uuid', nullable: true })
  assignedByUserId!: string | null;

  /** When the assignment was closed (step done / reassigned). Null while open. */
  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt!: Date | null;

  /** Optional SLA due date, for overdue reporting later. */
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;
}
