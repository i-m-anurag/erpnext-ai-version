import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../db/base.entity.js';
import type { WorkflowDefinition } from './workflow.schema.js';

/**
 * An IMMUTABLE, published snapshot of a workflow definition. Authoring happens in
 * config_resources (base→override); on publish we freeze the resolved definition
 * here with a monotonic version_no. Running documents pin to a row of this table,
 * so editing/publishing a new version never changes in-flight documents.
 */
@Entity('workflow_versions')
@Index('idx_wf_versions_key_status', ['workflowKey', 'status'])
export class WorkflowVersion extends BaseEntity {
  /** The workflow slug (config key). */
  @Column({ name: 'workflow_key', type: 'varchar', length: 128 })
  workflowKey!: string;

  /** The master/entity this workflow applies to (definition.appliesTo). */
  @Column({ name: 'entity_type', type: 'varchar', length: 64 })
  entityType!: string;

  @Column({ name: 'version_no', type: 'integer' })
  versionNo!: number;

  @Column({ type: 'varchar', length: 16, default: 'published' })
  status!: 'draft' | 'published' | 'retired';

  /** The frozen, resolved definition. Never mutated after insert. */
  @Column({ type: 'jsonb' })
  definition!: WorkflowDefinition;
}
