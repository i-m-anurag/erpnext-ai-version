import { BaseRepository } from '../../shared/base.repository.js';
import { permissionService } from '../permission/index.js';
import { User } from '../auth/user.entity.js';
import { approvalMatrixService } from './approval-matrix.service.js';
import type { WorkflowAttribute } from './workflow.schema.js';

/**
 * Builds the ATTRIBUTE CONTEXT that JSONLogic conditions evaluate against. This is
 * the "attribute registry" at runtime:
 *   doc.*     — the record's own fields
 *   user.*    — the acting user (roles, branch)
 *   system.*  — runtime values (today)
 *   lookup.*  — derived/master-linked values resolved from the definition's
 *               `attributes` (async lookups resolved here, BEFORE evaluation, so
 *               JSONLogic itself stays pure/sync).
 */
export class AttributeContextService {
  private readonly users = new BaseRepository(User);

  async build(
    data: Record<string, unknown>,
    userId: string,
    attributes: WorkflowAttribute[],
  ): Promise<Record<string, unknown>> {
    const roles = await permissionService.rolesForUser(userId);
    const u = await this.users.findById(userId);
    const lookup: Record<string, unknown> = {};
    for (const attr of attributes) {
      lookup[attr.key] = await this.resolveLookup(attr, data);
    }
    return {
      doc: data,
      user: { roles, branch: u?.branch ?? null },
      system: { today: new Date().toISOString().slice(0, 10) },
      lookup,
    };
  }

  private async resolveLookup(attr: WorkflowAttribute, data: Record<string, unknown>): Promise<unknown> {
    if (attr.source === 'matrix') {
      const branch = String(data[attr.matrix.branchField] ?? '');
      if (!branch) return null;
      return approvalMatrixService.limitFor(attr.matrix.role, branch);
    }
    return null;
  }
}

export const attributeContextService = new AttributeContextService();
