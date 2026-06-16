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
}
