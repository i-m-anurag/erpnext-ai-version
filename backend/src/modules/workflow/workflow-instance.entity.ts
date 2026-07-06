import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';

/**
 * One running workflow per document. Pins the exact `workflow_version` it started
 * on (immutability), and is the AUTHORITATIVE current state — the document's own
 * `state` column becomes a denormalised cache for list views.
 */
@Entity('workflow_instances')
@Index('idx_wf_instances_record', ['entityType', 'recordId'], { unique: true })
@Index('idx_wf_instances_version', ['workflowVersionId'])
export class WorkflowInstance extends BaseEntity {
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'record_id', type: 'varchar', length: 128 })
  recordId!: string;

  /** The pinned immutable version this instance runs on. */
  @Column({ name: 'workflow_version_id', type: 'uuid' })
  workflowVersionId!: string;

  @Column({ name: 'current_state', type: 'varchar', length: 64, nullable: true })
  currentState!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  status!: 'active' | 'closed';

  /** Denormalised branch/location (for reporting + branch-scoped approver routing). */
  @Column({ name: 'branch', type: 'varchar', length: 64, nullable: true })
  branch!: string | null;

  /** The active approval chain (null when none in progress). */
  @Column({ type: 'jsonb', nullable: true })
  approval!: ApprovalChain | null;
}

/** Runtime state of an in-progress serial approval chain (stored on the instance). */
export interface ApprovalChain {
  action: string;
  pendingState: string;
  onApproved: string;
  onRejected: string;
  steps: ApprovalStep[];
  currentStep: number;
}
export interface ApprovalStep {
  approver: 'role' | 'user';
  role?: string;
  user?: string;
  branchScoped?: boolean;
}
