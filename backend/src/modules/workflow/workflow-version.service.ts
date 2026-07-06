import { configResolver } from '../config/index.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { WORKFLOW_RESOURCE_TYPE } from './workflow.resource.js';
import type { WorkflowDefinition } from './workflow.schema.js';
import { WorkflowVersion } from './workflow-version.entity.js';

/**
 * Publishes and reads immutable workflow versions. Authoring lives in config
 * (base→override); publishing freezes the RESOLVED definition into a new version
 * that documents pin to. Editing config later + re-publishing makes a new version
 * and never touches in-flight documents.
 */
export class WorkflowVersionService {
  private readonly repo = new BaseRepository(WorkflowVersion);

  /** Freeze the current authored (config) definition as a new published version. */
  async publish(workflowSlug: string): Promise<WorkflowVersion> {
    const def = (await configResolver.resolve<WorkflowDefinition>(WORKFLOW_RESOURCE_TYPE, workflowSlug)).definition;
    const last = await this.repo.findOne({ workflowKey: workflowSlug }, { order: { versionNo: 'DESC' } });
    const versionNo = (last?.versionNo ?? 0) + 1;

    // retire any currently-published version(s) for this workflow
    const published = await this.repo.find({ where: { workflowKey: workflowSlug, status: 'published' } });
    for (const v of published) {
      v.status = 'retired';
      await this.repo.save(v);
    }

    return this.repo.save(
      this.repo.create({
        workflowKey: workflowSlug,
        entityType: def.appliesTo,
        versionNo,
        status: 'published',
        definition: def,
      }),
    );
  }

  /** The latest published version for a workflow, or null if never published. */
  async currentPublished(workflowSlug: string): Promise<WorkflowVersion | null> {
    return this.repo.findOne(
      { workflowKey: workflowSlug, status: 'published' },
      { order: { versionNo: 'DESC' } },
    );
  }

  async byId(id: string): Promise<WorkflowVersion | null> {
    return this.repo.findById(id);
  }

  /**
   * Ensure a published version exists for a workflow (publish once if not). Lets the
   * runtime lazily publish v1 the first time a document needs an instance.
   */
  async ensurePublished(workflowSlug: string): Promise<WorkflowVersion> {
    return (await this.currentPublished(workflowSlug)) ?? (await this.publish(workflowSlug));
  }
}

export const workflowVersionService = new WorkflowVersionService();
