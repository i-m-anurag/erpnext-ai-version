import { BaseRepository } from '../../shared/base.repository.js';
import type { WorkflowDefinition } from './workflow.schema.js';
import { WorkflowInstance } from './workflow-instance.entity.js';
import { workflowVersionService } from './workflow-version.service.js';

/**
 * Manages the per-document workflow instance: creates it (pinned to the current
 * published version) when a document first enters the workflow, and is the
 * authoritative holder of the current state.
 */
export class WorkflowInstanceService {
  private readonly repo = new BaseRepository(WorkflowInstance);

  async get(entityType: string, recordId: string): Promise<WorkflowInstance | null> {
    return this.repo.findOne({ entityType, recordId });
  }

  /**
   * Get-or-create the instance for a record, pinned to the workflow's current
   * published version (publishing v1 lazily on first use). Returns null if the
   * entity has no workflow to run.
   */
  async ensure(
    entityType: string,
    recordId: string,
    workflowSlug: string,
    opts: { branch?: string | null; startState?: string | null } = {},
  ): Promise<WorkflowInstance> {
    const existing = await this.get(entityType, recordId);
    if (existing) return existing;

    const version = await workflowVersionService.ensurePublished(workflowSlug);
    return this.repo.save(
      this.repo.create({
        entityType,
        recordId,
        workflowVersionId: version.id,
        // new docs start at startState; a backfilled doc keeps its cached state.
        currentState: opts.startState ?? version.definition.startState,
        status: 'active',
        branch: opts.branch ?? null,
      }),
    );
  }

  async setState(instance: WorkflowInstance, state: string | null): Promise<void> {
    instance.currentState = state;
    await this.repo.save(instance);
  }

  /** The immutable definition this instance is pinned to. */
  async definitionFor(instance: WorkflowInstance): Promise<WorkflowDefinition | null> {
    const v = await workflowVersionService.byId(instance.workflowVersionId);
    return v ? v.definition : null;
  }
}

export const workflowInstanceService = new WorkflowInstanceService();
