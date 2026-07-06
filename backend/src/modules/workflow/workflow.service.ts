import { configResolver } from '../config/index.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { permissionService } from '../permission/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { WORKFLOW_RESOURCE_TYPE } from './workflow.resource.js';
import type { Rule, WorkflowDefinition, WorkflowState } from './workflow.schema.js';
import { evaluateBranch } from './condition.js';
import { attributeContextService } from './attribute-context.service.js';
import { executeAction, type ActionContext, type WorkflowRecord } from './workflow.actions.js';
import { assignmentService } from './assignment.service.js';
import { workflowInstanceService } from './workflow-instance.service.js';
import type { WorkflowInstance } from './workflow-instance.entity.js';
import { documentDataService } from '../document/index.js';

export interface WorkflowStatus {
  hasWorkflow: boolean;
  currentState: string | null;
  states: WorkflowState[];
  /** actions available from the current state; `enabled` is false when an action
   *  requires being the assignee and this user isn't. */
  actions: { action: string; requiresAssignee: boolean; enabled: boolean }[];
  /** the field form may be edited / saved (only in the start state). */
  editable: boolean;
  /** cross-document "Create next" buttons are allowed in the current state. */
  canCreateNext: boolean;
  /** this user is the record's current open assignee. */
  isAssignee: boolean;
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

  /**
   * The running instance for a record + its PINNED definition. Backfills an instance
   * for documents that predate v2 (seeding the instance from the doc's cached state).
   * Returns null when the master has no workflow.
   */
  private async instanceFor(
    masterSlug: string,
    code: string,
  ): Promise<{ instance: WorkflowInstance; def: WorkflowDefinition } | null> {
    const reg = await this.registry.findOne({ slug: masterSlug });
    if (!reg?.workflowSlug) return null;
    let instance = await workflowInstanceService.get(masterSlug, code);
    if (!instance) {
      const rec = await this.loadRecord(masterSlug, code); // backfill from the doc cache
      instance = await workflowInstanceService.ensure(masterSlug, code, reg.workflowSlug, {
        branch: (rec.data['branch'] as string | undefined) ?? null,
        startState: rec.state ?? undefined,
      });
    }
    const def = await workflowInstanceService.definitionFor(instance);
    if (!def) throw new NotFoundError('pinned workflow version missing');
    return { instance, def };
  }

  async status(masterSlug: string, code: string, userId: string): Promise<WorkflowStatus> {
    const ctx = await this.instanceFor(masterSlug, code);
    // No workflow → nothing to gate: form editable, create-next allowed (as before).
    if (!ctx) {
      return { hasWorkflow: false, currentState: null, states: [], actions: [], editable: true, canCreateNext: true, isAssignee: false };
    }
    const wf = ctx.def;
    const cur = ctx.instance.currentState ?? wf.startState;
    const roles = await permissionService.rolesForUser(userId);
    const assignee = await assignmentService.activeAssignee(masterSlug, code);
    const isAssignee = assignee != null && assignee === userId;

    // action name → requiresAssignee (OR across matching rules)
    const byAction = new Map<string, boolean>();
    for (const r of wf.rules) {
      if (
        (r.trigger.fromState == null || r.trigger.fromState === cur) &&
        (r.trigger.roles.length === 0 || r.trigger.roles.some((role) => roles.includes(role)))
      ) {
        byAction.set(r.trigger.action, (byAction.get(r.trigger.action) ?? false) || r.trigger.requiresAssignee === true);
      }
    }
    const actions = [...byAction].map(([action, requiresAssignee]) => ({
      action,
      requiresAssignee,
      enabled: !requiresAssignee || isAssignee,
    }));

    return {
      hasWorkflow: true,
      currentState: cur,
      states: wf.states,
      actions,
      editable: cur === wf.startState,
      canCreateNext: wf.states.find((s) => s.name === cur)?.allowCreateNext === true,
      isAssignee,
    };
  }

  /** Whether a record's field form may be edited (only in the start state). No
   *  workflow → always editable. Uses the pinned definition + instance state. */
  async isEditable(masterSlug: string, code: string): Promise<boolean> {
    const ctx = await this.instanceFor(masterSlug, code);
    if (!ctx) return true;
    return (ctx.instance.currentState ?? ctx.def.startState) === ctx.def.startState;
  }

  /** Editability from a known state (the doc's cached state), avoiding a record load.
   *  Uses config's startState (stable across versions) — good enough for the guard. */
  async isEditableState(masterSlug: string, state: string | null): Promise<boolean> {
    const wf = await this.getForMaster(masterSlug);
    if (!wf) return true;
    return (state ?? wf.startState) === wf.startState;
  }

  /** Whether cross-document "create next" is allowed in the record's current state. */
  async canCreateNext(masterSlug: string, code: string): Promise<boolean> {
    const ctx = await this.instanceFor(masterSlug, code);
    if (!ctx) return true;
    const cur = ctx.instance.currentState ?? ctx.def.startState;
    return ctx.def.states.find((s) => s.name === cur)?.allowCreateNext === true;
  }

  async runAction(masterSlug: string, code: string, action: string, userId: string): Promise<ActionResult> {
    const ctx = await this.instanceFor(masterSlug, code);
    if (!ctx) throw new BadRequestError('this master has no workflow');
    const { instance, def: wf } = ctx;
    const rec = await this.loadRecord(masterSlug, code);
    rec.state = instance.currentState; // instance is authoritative
    const from = rec.state ?? wf.startState;
    const roles = await permissionService.rolesForUser(userId);
    const rules = this.matchingRules(wf, action, from, roles);
    if (rules.length === 0) throw new BadRequestError(`action "${action}" is not available`);

    // Assignee gate (opt-in per rule): only the current assignee may fire it.
    if (rules.some((r) => r.trigger.requiresAssignee === true)) {
      const assignee = await assignmentService.activeAssignee(masterSlug, code);
      if (assignee !== userId) throw new ForbiddenError('this action is restricted to the current assignee');
    }

    // Assignments that were open BEFORE this transition. If the state advances,
    // that step's work is done, so we close exactly these — never the fresh ones
    // that an `assign` action may open for the new state (order-independent).
    const openBefore = await assignmentService.openIdsFor(masterSlug, code);

    // Build the attribute context once (doc/user/system + resolved lookups) so
    // branch conditions can compare fields to user attributes, other fields, or
    // matrix-derived limits — not just hard-coded literals.
    const context = await attributeContextService.build(rec.data, userId, wf.attributes ?? []);

    let mutated = false;
    for (const rule of rules) {
      const branch = rule.branches.find((b) => evaluateBranch(b, context));
      if (!branch) continue;
      const ctx: ActionContext = { entityType: masterSlug, recordId: code, row: rec, actorUserId: userId, ruleName: rule.name };
      for (const act of branch.actions) {
        const res = await executeAction(act, ctx);
        mutated = mutated || res.mutated;
      }
    }

    const to = rec.state ?? wf.startState;
    // Instance is authoritative; the doc's `state` column is a cache updated via
    // persistRecord (which also saves any set_field data changes).
    await workflowInstanceService.setState(instance, to);
    if (mutated) await this.persistRecord(masterSlug, rec);
    if (from !== to) await assignmentService.closeByIds(openBefore);
    return { action, from, to, stateChanged: from !== to };
  }
}

export const workflowService = new WorkflowService();
