import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { ConfigResource } from '../config/config-resource.entity.js';
import { configResolver } from '../config/index.js';
import { WORKFLOW_RESOURCE_TYPE } from './workflow.resource.js';
import { workflowVersionService } from './workflow-version.service.js';
import { workflowDefinitionSchema, type WorkflowDefinition } from './workflow.schema.js';

export interface WorkflowSummary {
  slug: string;
  appliesTo: string;
  states: number;
  rules: number;
  resolvedFrom: string;
}

/**
 * UI-facing CRUD over workflow definitions. Same base/custom model as templates:
 * reads return the effective definition; saves write the custom scope so shipped
 * defaults stay intact; reset removes the override.
 */
export class WorkflowAdminService {
  private readonly repo = new BaseRepository(ConfigResource);

  async list(): Promise<WorkflowSummary[]> {
    const rows = await this.repo.find({ where: { resourceType: WORKFLOW_RESOURCE_TYPE, status: 'active' } });
    const slugs = [...new Set(rows.map((r) => r.slug))].sort();
    const out: WorkflowSummary[] = [];
    for (const slug of slugs) {
      const eff = await configResolver.resolve<WorkflowDefinition>(WORKFLOW_RESOURCE_TYPE, slug);
      out.push({
        slug,
        appliesTo: eff.definition.appliesTo,
        states: eff.definition.states.length,
        rules: eff.definition.rules.length,
        resolvedFrom: eff.resolvedFrom,
      });
    }
    return out;
  }

  async get(slug: string): Promise<WorkflowDefinition & { resolvedFrom: string }> {
    const eff = await configResolver.resolve<WorkflowDefinition>(WORKFLOW_RESOURCE_TYPE, slug);
    return { ...eff.definition, resolvedFrom: eff.resolvedFrom };
  }

  async save(slug: string, input: unknown): Promise<WorkflowDefinition> {
    const def = workflowDefinitionSchema.parse({ ...(input as Record<string, unknown>), slug });
    await configResolver.upsert(
      WORKFLOW_RESOURCE_TYPE,
      slug,
      'custom',
      def as unknown as Record<string, unknown>,
    );
    // Snapshot a new immutable version so *new* documents pick up the edit
    // (in-flight instances stay pinned to the version they started on).
    await workflowVersionService.publishIfChanged(slug);
    return def;
  }

  async resetOverride(slug: string): Promise<void> {
    const custom = await this.repo.findOne({ resourceType: WORKFLOW_RESOURCE_TYPE, slug, scope: 'custom' });
    if (!custom) throw new NotFoundError('no custom override to reset');
    await this.repo.delete(custom.id);
    await configResolver.invalidate(WORKFLOW_RESOURCE_TYPE, slug);
    // Reverting to base also changes the effective definition → publish it.
    await workflowVersionService.publishIfChanged(slug);
  }
}

export const workflowAdminService = new WorkflowAdminService();
