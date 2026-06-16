import { configResolver } from '../config/index.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { permissionService } from '../permission/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { WORKFLOW_RESOURCE_TYPE } from './workflow.resource.js';
import type { Rule, WorkflowDefinition, WorkflowState } from './workflow.schema.js';
import { evaluateConditions } from './condition.js';
import { executeAction, type ActionContext } from './workflow.actions.js';

export interface WorkflowStatus {
  hasWorkflow: boolean;
  currentState: string | null;
  states: WorkflowState[];
  /** action names this user may trigger from the current state */
  actions: { action: string }[];
}

export interface ActionResult {
  action: string;
  from: string;
  to: string;
  stateChanged: boolean;
}

/**
 * Rule engine over a master's `state`. A user-triggered action runs every rule
 * that matches (action name + current state + the user's roles); each rule
 * evaluates its branches (first matching `if`, else the `else`) and runs that
 * branch's actions — set_state / set_field / assign / email.
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

  /** Rules of `wf` triggered by `action`, available from `state` to a user with `roles`. */
  private matchingRules(wf: WorkflowDefinition, action: string, state: string, roles: string[]): Rule[] {
    return wf.rules.filter(
      (r) =>
        r.trigger.action === action &&
        (r.trigger.fromState == null || r.trigger.fromState === state) &&
        (r.trigger.roles.length === 0 || r.trigger.roles.some((role) => roles.includes(role))),
    );
  }

  async status(masterSlug: string, code: string, userId: string): Promise<WorkflowStatus> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) return { hasWorkflow: false, currentState: null, states: [], actions: [] };
    const row = await this.data.findOne({ masterSlug, code });
    if (!row) throw new NotFoundError('record not found');
    const cur = this.current(wf, row);
    const roles = await permissionService.rolesForUser(userId);
    const names = new Set<string>();
    for (const r of wf.rules) {
      if (
        (r.trigger.fromState == null || r.trigger.fromState === cur) &&
        (r.trigger.roles.length === 0 || r.trigger.roles.some((role) => roles.includes(role)))
      ) {
        names.add(r.trigger.action);
      }
    }
    return { hasWorkflow: true, currentState: cur, states: wf.states, actions: [...names].map((action) => ({ action })) };
  }

  async runAction(masterSlug: string, code: string, action: string, userId: string): Promise<ActionResult> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) throw new BadRequestError('this master has no workflow');
    const row = await this.data.findOne({ masterSlug, code });
    if (!row) throw new NotFoundError('record not found');
    const from = this.current(wf, row);
    const roles = await permissionService.rolesForUser(userId);
    const rules = this.matchingRules(wf, action, from, roles);
    if (rules.length === 0) throw new BadRequestError(`action "${action}" is not available`);

    let mutated = false;
    for (const rule of rules) {
      const branch = rule.branches.find((b) => evaluateConditions(b.conditions, row.data));
      if (!branch) continue;
      const ctx: ActionContext = { entityType: masterSlug, recordId: code, row, actorUserId: userId, ruleName: rule.name };
      for (const act of branch.actions) {
        const res = await executeAction(act, ctx);
        mutated = mutated || res.mutated;
      }
    }

    if (mutated) await this.data.save(row);
    const to = this.current(wf, row);
    return { action, from, to, stateChanged: from !== to };
  }
}

export const workflowService = new WorkflowService();
