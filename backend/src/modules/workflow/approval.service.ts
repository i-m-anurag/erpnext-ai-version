import { In } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { permissionService } from '../permission/index.js';
import { activityService } from '../activity/index.js';
import { User } from '../auth/user.entity.js';
import { MasterRegistry } from '../master/master-registry.entity.js';
import { MasterData } from '../master/master-data.entity.js';
import { documentDataService } from '../document/document-data.service.js';
import { Assignment } from './assignment.entity.js';
import { WorkflowInstance, type ApprovalChain, type ApprovalStep } from './workflow-instance.entity.js';
import { workflowInstanceService } from './workflow-instance.service.js';
import { evaluateBranch } from './condition.js';
import type { ApprovalConfig } from './workflow.schema.js';

export interface ApprovalActResult {
  outcome: 'approved' | 'rejected';
  to: string;
  chainDone: boolean;
  nextStep?: number;
}

/**
 * Serial approval sub-engine. A triggering action (e.g. Submit) starts a chain:
 * the first matching tier's ordered steps are approved one at a time — each step
 * opens ONE task (an assignment with a step_no) for the least-loaded eligible
 * approver; approving advances to the next step, rejecting ends the chain. The
 * instance holds the chain state; assignments double as the "My Approvals" inbox.
 */
export class ApprovalService {
  private readonly tasks = new BaseRepository(Assignment);
  private readonly users = new BaseRepository(User);
  private readonly registry = new BaseRepository(MasterRegistry);
  private readonly masterData = new BaseRepository(MasterData);

  /**
   * Start the chain for an action if a tier matches. Sets the instance to
   * `pendingState` and opens step-0's task. Returns false when no tier matches
   * (the caller then runs the action's normal transition).
   */
  async start(
    masterSlug: string,
    code: string,
    instance: WorkflowInstance,
    cfg: ApprovalConfig,
    context: Record<string, unknown>,
    actorUserId: string,
  ): Promise<boolean> {
    const tier = cfg.rules.find((r) => evaluateBranch({ when: r.when, conditions: [], actions: [] }, context));
    if (!tier || tier.steps.length === 0) return false;

    // Resolve the first approver up front so we block (not half-start) if none.
    const approver = await this.resolveApprover(tier.steps[0]!, instance);
    if (!approver) throw new BadRequestError('no eligible approver for the first approval step');

    instance.approval = {
      action: cfg.action,
      pendingState: cfg.pendingState,
      onApproved: cfg.onApproved,
      onRejected: cfg.onRejected,
      steps: tier.steps,
      currentStep: 0,
    };
    await workflowInstanceService.setState(instance, cfg.pendingState); // saves the instance (incl. approval)
    await this.syncDocCache(masterSlug, code, cfg.pendingState);
    await this.openTask(masterSlug, code, instance.approval, 0, approver, actorUserId);
    return true;
  }

  /** An approver approves/rejects their task; advances or ends the chain. */
  async act(taskId: string, userId: string, outcome: 'approved' | 'rejected', comment?: string): Promise<ApprovalActResult> {
    const task = await this.tasks.findById(taskId);
    if (!task || task.stepNo === null) throw new NotFoundError('approval task not found');
    if (task.status !== 'open') throw new BadRequestError('this task has already been actioned');
    if (task.assigneeUserId !== userId) throw new ForbiddenError('this task is assigned to someone else');

    const instance = await workflowInstanceService.get(task.entityType, task.recordId);
    const chain = instance?.approval;
    if (!instance || !chain) throw new BadRequestError('no active approval for this record');

    task.status = 'closed';
    task.closedAt = new Date();
    task.outcome = outcome;
    if (comment) task.ruleName = task.ruleName; // (comment storage is a later enhancement)
    await this.tasks.save(task);

    if (outcome === 'rejected') {
      instance.approval = null;
      await workflowInstanceService.setState(instance, chain.onRejected);
      await this.syncDocCache(task.entityType, task.recordId, chain.onRejected);
      await activityService.addTimeline(task.entityType, task.recordId, 'state_changed', `Rejected → ${chain.onRejected}`, userId);
      return { outcome, to: chain.onRejected, chainDone: true };
    }

    const next = chain.currentStep + 1;
    if (next < chain.steps.length) {
      const approver = await this.resolveApprover(chain.steps[next]!, instance);
      if (!approver) throw new BadRequestError(`no eligible approver for approval step ${next + 1}`);
      chain.currentStep = next;
      instance.approval = chain;
      await workflowInstanceService.setState(instance, chain.pendingState); // persist chain progress
      await this.openTask(task.entityType, task.recordId, chain, next, approver, userId);
      await activityService.addTimeline(task.entityType, task.recordId, 'state_changed', `Approved step ${next} → step ${next + 1}`, userId);
      return { outcome, to: chain.pendingState, chainDone: false, nextStep: next };
    }

    // last step cleared → chain complete
    instance.approval = null;
    await workflowInstanceService.setState(instance, chain.onApproved);
    await this.syncDocCache(task.entityType, task.recordId, chain.onApproved);
    await activityService.addTimeline(task.entityType, task.recordId, 'state_changed', `Approved → ${chain.onApproved}`, userId);
    return { outcome, to: chain.onApproved, chainDone: true };
  }

  // ── internals ──────────────────────────────────────────────────────────────
  private async openTask(
    masterSlug: string,
    code: string,
    chain: ApprovalChain,
    stepNo: number,
    approver: string,
    actorUserId: string,
  ): Promise<void> {
    const step = chain.steps[stepNo]!;
    await this.tasks.save(
      this.tasks.create({
        entityType: masterSlug,
        recordId: code,
        assigneeUserId: approver,
        status: 'open',
        role: step.role ?? null,
        state: chain.pendingState,
        stepNo,
        ruleName: 'approval',
        assignedByUserId: actorUserId,
      }),
    );
    const name = await this.nameOf(approver);
    await activityService.addTimeline(masterSlug, code, 'assigned', `Approval step ${stepNo + 1} → ${name}`, actorUserId);
  }

  /** Resolve one approver for a step (least-loaded among the eligible), or null. */
  private async resolveApprover(step: ApprovalStep, instance: WorkflowInstance): Promise<string | null> {
    if (step.approver === 'user') return step.user ?? null;
    if (!step.role) return null;
    let candidates = await permissionService.userIdsWithRoleCode(step.role);
    if (step.branchScoped && instance.branch) {
      const inBranch = await this.users.find({ where: { id: In(candidates), branch: instance.branch } });
      candidates = inBranch.map((u) => u.id);
    }
    if (candidates.length === 0) return null;
    let best = candidates[0]!;
    let min = Infinity;
    for (const c of candidates) {
      const n = await this.tasks.count({ assigneeUserId: c, status: 'open' });
      if (n < min) {
        min = n;
        best = c;
      }
    }
    return best;
  }

  private async syncDocCache(masterSlug: string, code: string, state: string): Promise<void> {
    const reg = await this.registry.findOne({ slug: masterSlug });
    if (reg?.kind === 'document') {
      await documentDataService.setStateByCode(masterSlug, code, state);
      return;
    }
    const row = await this.masterData.findOne({ masterSlug, code });
    if (row) {
      row.state = state;
      await this.masterData.save(row);
    }
  }

  private async nameOf(userId: string): Promise<string> {
    const u = await this.users.findById(userId);
    return u?.displayName ?? u?.username ?? 'user';
  }
}

export const approvalService = new ApprovalService();
