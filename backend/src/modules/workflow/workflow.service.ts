import { configResolver } from '../config/index.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { permissionService } from '../permission/index.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { WORKFLOW_RESOURCE_TYPE } from './workflow.resource.js';
import type { Rule, WorkflowDefinition, WorkflowState } from './workflow.schema.js';
import { evaluateConditions } from './condition.js';
import { executeAction, type ActionContext, type WorkflowRecord } from './workflow.actions.js';
import { assignmentService } from './assignment.service.js';
import { documentDataService } from '../document/index.js';

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

  /** Rules of `wf` triggered by `action`, available from `state` to a user with `roles`. */
  private matchingRules(wf: WorkflowDefinition, action: string, state: string, roles: string[]): Rule[] {
    return wf.rules.filter(
      (r) =>
        r.trigger.action === action &&
        (r.trigger.fromState == null || r.trigger.fromState === state) &&
        (r.trigger.roles.length === 0 || r.trigger.roles.some((role) => roles.includes(role))),
    );
  }

  /** Load a record's {id, state, data} from the right store (master_data or document table). */
  private async loadRecord(masterSlug: string, code: string): Promise<WorkflowRecord> {
    const reg = await this.registry.findOne({ slug: masterSlug });
    if (reg?.kind === 'document') {
      const doc = await documentDataService.getByCode(masterSlug, code);
      return { id: doc.id, state: doc.state, data: doc.data };
    }
    const row = await this.data.findOne({ masterSlug, code });
    if (!row) throw new NotFoundError('record not found');
    return { id: row.id, state: row.state, data: row.data };
  }

  private async persistRecord(masterSlug: string, rec: WorkflowRecord): Promise<void> {
    const reg = await this.registry.findOne({ slug: masterSlug });
    if (reg?.kind === 'document') {
      await documentDataService.persistWorkflow(masterSlug, rec.id, rec.state, rec.data);
      return;
    }
    const row = await this.data.findOne({ id: rec.id, masterSlug });
    if (!row) return;
    row.state = rec.state;
    row.data = rec.data;
    await this.data.save(row);
  }

  async status(masterSlug: string, code: string, userId: string): Promise<WorkflowStatus> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) return { hasWorkflow: false, currentState: null, states: [], actions: [] };
    const rec = await this.loadRecord(masterSlug, code);
    const cur = rec.state ?? wf.startState;
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
    const rec = await this.loadRecord(masterSlug, code);
    const from = rec.state ?? wf.startState;
    const roles = await permissionService.rolesForUser(userId);
    const rules = this.matchingRules(wf, action, from, roles);
    if (rules.length === 0) throw new BadRequestError(`action "${action}" is not available`);

    // Assignments that were open BEFORE this transition. If the state advances,
    // that step's work is done, so we close exactly these — never the fresh ones
    // that an `assign` action may open for the new state (order-independent).
    const openBefore = await assignmentService.openIdsFor(masterSlug, code);

    let mutated = false;
    for (const rule of rules) {
      const branch = rule.branches.find((b) => evaluateConditions(b.conditions, rec.data));
      if (!branch) continue;
      const ctx: ActionContext = { entityType: masterSlug, recordId: code, row: rec, actorUserId: userId, ruleName: rule.name };
      for (const act of branch.actions) {
        const res = await executeAction(act, ctx);
        mutated = mutated || res.mutated;
      }
    }

    if (mutated) await this.persistRecord(masterSlug, rec);
    const to = rec.state ?? wf.startState;
    if (from !== to) await assignmentService.closeByIds(openBefore);
    return { action, from, to, stateChanged: from !== to };
  }
}

export const workflowService = new WorkflowService();
