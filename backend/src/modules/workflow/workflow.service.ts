import { configResolver } from '../config/index.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { permissionService } from '../permission/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { WORKFLOW_RESOURCE_TYPE } from './workflow.resource.js';
import type { WorkflowDefinition, WorkflowState } from './workflow.schema.js';
import { evaluateCondition } from './condition.js';

export interface WorkflowStatus {
  hasWorkflow: boolean;
  currentState: string | null;
  states: WorkflowState[];
  /** transitions available to THIS user from the current state */
  actions: { action: string; to: string }[];
}

export interface TransitionResult {
  from: string;
  to: string;
  action: string;
}

/**
 * Resolves a master's workflow (config resource), computes the current state of a
 * row (null state = the workflow's start state), the actions available to a user
 * (role + condition gated), and applies a transition by writing `master_data.state`.
 */
export class WorkflowService {
  private readonly registry = new BaseRepository(MasterRegistry);
  private readonly data = new BaseRepository(MasterData);

  async getForMaster(masterSlug: string): Promise<WorkflowDefinition | null> {
    const reg = await this.registry.findOne({ slug: masterSlug });
    if (!reg?.workflowSlug) return null;
    const eff = await configResolver.resolve<WorkflowDefinition>(WORKFLOW_RESOURCE_TYPE, reg.workflowSlug);
    return eff.definition;
  }

  private current(wf: WorkflowDefinition, row: MasterData): string {
    return row.state ?? wf.startState;
  }

  async status(masterSlug: string, code: string, userId: string): Promise<WorkflowStatus> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) return { hasWorkflow: false, currentState: null, states: [], actions: [] };
    const row = await this.data.findOne({ masterSlug, code });
    if (!row) throw new NotFoundError('record not found');
    const cur = this.current(wf, row);
    const roles = await permissionService.rolesForUser(userId);
    const actions = wf.transitions
      .filter((t) => t.from === cur)
      .filter((t) => t.roles.length === 0 || t.roles.some((r) => roles.includes(r)))
      .filter((t) => evaluateCondition(t.condition ?? null, row.data))
      .map((t) => ({ action: t.action, to: t.to }));
    return { hasWorkflow: true, currentState: cur, states: wf.states, actions };
  }

  async transition(masterSlug: string, code: string, action: string, userId: string): Promise<TransitionResult> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) throw new BadRequestError('this master has no workflow');
    const row = await this.data.findOne({ masterSlug, code });
    if (!row) throw new NotFoundError('record not found');
    const cur = this.current(wf, row);
    const t = wf.transitions.find((x) => x.action === action && x.from === cur);
    if (!t) throw new BadRequestError(`action "${action}" is not available from "${cur}"`);
    const roles = await permissionService.rolesForUser(userId);
    if (t.roles.length > 0 && !t.roles.some((r) => roles.includes(r))) {
      throw new ForbiddenError(`your role cannot perform "${action}"`);
    }
    if (!evaluateCondition(t.condition ?? null, row.data)) {
      throw new BadRequestError(`condition not met for "${action}"`);
    }
    row.state = t.to;
    await this.data.save(row);
    return { from: cur, to: t.to, action };
  }
}

export const workflowService = new WorkflowService();
