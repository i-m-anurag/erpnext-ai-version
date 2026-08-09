import { configResolver } from '../config/index.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { permissionService } from '../permission/index.js';
import { activityService } from '../activity/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
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
  /** action names this user may trigger from the current state (already gated by
   *  role, per-state `allow`, requiresAssignee and allowSelfApproval) */
  actions: { action: string }[];
  /** the field form is read-only in the current state (editableStates / formReadOnly) */
  formReadOnly: boolean;
  /** convenience inverse of formReadOnly */
  editable: boolean;
  /** the current state's `allow` list, or null when the state imposes no restriction */
  allow: string[] | null;
  /** the caller is the record's current open assignee */
  isAssignee: boolean;
  /** the record's current open assignee (for an "Assigned to …" hint) */
  activeAssignee: { id: string; name: string } | null;
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

  /**
   * Guard the data-update path: reject an edit when the record's workflow state is
   * not one of `editableStates`. No workflow, or no `editableStates` configured =
   * no restriction. Called at the API boundary (masterController) so internal
   * service cascades (e.g. requisition propagation) are not blocked.
   */
  async assertEditable(masterSlug: string, id: string): Promise<void> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf?.editableStates) return;
    const state = (await this.loadStateById(masterSlug, id)) ?? wf.startState;
    if (!this.isEditable(wf, state)) {
      throw new BadRequestError(`this record is read-only in state "${state}" and cannot be edited`);
    }
  }

  /** Load just the `state` of a record by its id (either store), or null if absent. */
  private async loadStateById(masterSlug: string, id: string): Promise<string | null> {
    const reg = await this.registry.findOne({ slug: masterSlug });
    if (reg?.kind === 'document') {
      const doc = await documentDataService.getById(masterSlug, id);
      return doc.state;
    }
    const row = await this.data.findOne({ id, masterSlug });
    return row?.state ?? null;
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

  /** The workflow state definition by name (for its `allow` / `formReadOnly` flags). */
  private stateDef(wf: WorkflowDefinition, name: string): WorkflowState | undefined {
    return wf.states.find((s) => s.name === name);
  }

  /** Is the field form editable in `state`? `editableStates` absent = no restriction. */
  private isEditable(wf: WorkflowDefinition, state: string): boolean {
    if (!wf.editableStates) return this.stateDef(wf, state)?.formReadOnly !== true;
    return wf.editableStates.includes(state) && this.stateDef(wf, state)?.formReadOnly !== true;
  }

  async status(masterSlug: string, code: string, userId: string): Promise<WorkflowStatus> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) {
      return {
        hasWorkflow: false, currentState: null, states: [], actions: [],
        formReadOnly: false, editable: true, allow: null, isAssignee: false, activeAssignee: null,
      };
    }
    const rec = await this.loadRecord(masterSlug, code);
    const cur = rec.state ?? wf.startState;
    const roles = await permissionService.rolesForUser(userId);

    const activeAssigneeId = await assignmentService.activeAssignee(masterSlug, code);
    const isAssignee = activeAssigneeId != null && activeAssigneeId === userId;
    // Only resolve the creator if some available rule needs it (self-approval gating).
    let creatorId: string | null | undefined;
    const creator = async (): Promise<string | null> => {
      if (creatorId === undefined) creatorId = await activityService.creatorOf(masterSlug, code);
      return creatorId;
    };

    const allow = this.stateDef(wf, cur)?.allow ?? null;
    const names = new Set<string>();
    for (const r of wf.rules) {
      if (r.trigger.fromState != null && r.trigger.fromState !== cur) continue;
      if (r.trigger.roles.length > 0 && !r.trigger.roles.some((role) => roles.includes(role))) continue;
      if (allow && !allow.includes(r.trigger.action)) continue;
      if (r.trigger.requiresAssignee && !isAssignee) continue;
      if (r.trigger.allowSelfApproval === false && (await creator()) === userId) continue;
      names.add(r.trigger.action);
    }

    const activeAssignee = activeAssigneeId
      ? { id: activeAssigneeId, name: await assignmentService.nameOf(activeAssigneeId) }
      : null;
    const editable = this.isEditable(wf, cur);
    return {
      hasWorkflow: true,
      currentState: cur,
      states: wf.states,
      actions: [...names].map((action) => ({ action })),
      formReadOnly: !editable,
      editable,
      allow,
      isAssignee,
      activeAssignee,
    };
  }

  async runAction(masterSlug: string, code: string, action: string, userId: string): Promise<ActionResult> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) throw new BadRequestError('this master has no workflow');
    const rec = await this.loadRecord(masterSlug, code);
    const from = rec.state ?? wf.startState;
    const roles = await permissionService.rolesForUser(userId);
    const rules = this.matchingRules(wf, action, from, roles);
    if (rules.length === 0) throw new BadRequestError(`action "${action}" is not available`);

    // Per-state button gating: if the current state restricts actions, the action must be allowed.
    const allow = this.stateDef(wf, from)?.allow ?? null;
    if (allow && !allow.includes(action)) {
      throw new BadRequestError(`action "${action}" is not available in state "${from}"`);
    }
    // Assignee gating: a rule may require the actor to be the current open assignee.
    if (rules.some((r) => r.trigger.requiresAssignee)) {
      const active = await assignmentService.activeAssignee(masterSlug, code);
      if (active !== userId) throw new ForbiddenError('this action is restricted to the current assignee');
    }
    // Self-approval gating: a rule may forbid the record's creator from acting.
    if (rules.some((r) => r.trigger.allowSelfApproval === false)) {
      const creator = await activityService.creatorOf(masterSlug, code);
      if (creator && creator === userId) throw new ForbiddenError('you cannot approve a record you created');
    }

    // Snapshot the open assignments BEFORE running actions, so a state advance closes
    // exactly the step that is finishing — never a new step's `assign` created here.
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
    // The step is done once the state advances: close the assignments that were open
    // before this transition (the finishing step's tasks).
    if (from !== to && openBefore.length) await assignmentService.closeMany(openBefore);
    return { action, from, to, stateChanged: from !== to };
  }
}

export const workflowService = new WorkflowService();
