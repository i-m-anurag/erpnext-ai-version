import { In } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { activityService } from '../activity/index.js';
import { User } from '../auth/user.entity.js';
import { Assignment } from './assignment.entity.js';

/** An assignment enriched with the display names its UI needs. */
export interface AssignmentView {
  id: string;
  entityType: string;
  recordId: string;
  assigneeUserId: string;
  assigneeName: string;
  status: 'open' | 'closed';
  role: string | null;
  state: string | null;
  ruleName: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  createdAt: Date;
  closedAt: Date | null;
  dueAt: Date | null;
}

/** Context an `assign` action (or a reassign) records on a new assignment. */
export interface OpenAssignmentInput {
  entityType: string;
  recordId: string;
  assigneeUserId: string;
  role?: string | null;
  state?: string | null;
  ruleName?: string | null;
  assignedByUserId?: string | null;
  dueAt?: Date | null;
}

/**
 * Queries and lifecycle over the append-only `assignments` table. Assignments are
 * opened by the workflow `assign` action, closed when the step advances (see
 * {@link closeOpenFor}, called from the transition flow) or reassigned — never
 * deleted, so `forRecord` returns the full history of who a record was with.
 */
export class AssignmentService {
  private readonly repo = new BaseRepository(Assignment);
  private readonly users = new BaseRepository(User);

  /** Open a new assignment row (used by the `assign` action and by reassign). */
  async open(input: OpenAssignmentInput): Promise<Assignment> {
    return this.repo.save(
      this.repo.create({
        entityType: input.entityType,
        recordId: input.recordId,
        assigneeUserId: input.assigneeUserId,
        status: 'open',
        role: input.role ?? null,
        state: input.state ?? null,
        ruleName: input.ruleName ?? null,
        assignedByUserId: input.assignedByUserId ?? null,
        dueAt: input.dueAt ?? null,
      }),
    );
  }

  /** A user's worklist. Defaults to their OPEN tasks, newest first. */
  async forUser(userId: string, opts: { status?: 'open' | 'closed' } = {}): Promise<AssignmentView[]> {
    const rows = await this.repo.find({
      where: { assigneeUserId: userId, status: opts.status ?? 'open' },
      order: { createdAt: 'DESC' },
    });
    return this.enrich(rows);
  }

  /** Full assignment history for a record, oldest first (the trail of who it was with). */
  async forRecord(entityType: string, recordId: string): Promise<AssignmentView[]> {
    const rows = await this.repo.find({
      where: { entityType, recordId },
      order: { createdAt: 'ASC' },
    });
    return this.enrich(rows);
  }

  /** The current open assignee's userId (latest open row), or null if unassigned. */
  async activeAssignee(entityType: string, recordId: string): Promise<string | null> {
    const row = await this.repo.findOne(
      { entityType, recordId, status: 'open' },
      { order: { createdAt: 'DESC' } },
    );
    return row?.assigneeUserId ?? null;
  }

  /**
   * Close the open assignments for a record — all of them, or only those in a given
   * state. Called from the transition flow when the workflow state advances (a step
   * is done once the record moves on). Returns how many rows were closed.
   */
  async closeOpenFor(entityType: string, recordId: string, opts: { state?: string } = {}): Promise<number> {
    const where = opts.state
      ? { entityType, recordId, status: 'open' as const, state: opts.state }
      : { entityType, recordId, status: 'open' as const };
    const open = await this.repo.find({ where });
    const now = new Date();
    for (const a of open) {
      a.status = 'closed';
      a.closedAt = now;
      await this.repo.save(a);
    }
    return open.length;
  }

  /** Close whichever of the given assignments are still open. Used by the transition
   *  flow with a snapshot of the open rows taken BEFORE the transition ran, so
   *  assignments created DURING the transition (a new step's `assign`) are untouched
   *  regardless of action order. Returns how many were closed. */
  async closeMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.repo.find({ where: { id: In(ids), status: 'open' } });
    const now = new Date();
    for (const a of rows) {
      a.status = 'closed';
      a.closedAt = now;
      await this.repo.save(a);
    }
    return rows.length;
  }

  /** The ids of a record's currently-open assignments (snapshot for {@link closeMany}). */
  async openIdsFor(entityType: string, recordId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { entityType, recordId, status: 'open' } });
    return rows.map((r) => r.id);
  }

  /** Close the old assignment and open a new one for the same record (history preserved). */
  async reassign(id: string, toUserId: string, byUserId: string): Promise<Assignment> {
    const old = await this.repo.findById(id);
    if (!old) throw new NotFoundError('assignment not found');
    if (old.status === 'open') {
      old.status = 'closed';
      old.closedAt = new Date();
      await this.repo.save(old);
    }
    const created = await this.open({
      entityType: old.entityType,
      recordId: old.recordId,
      assigneeUserId: toUserId,
      role: old.role,
      state: old.state,
      ruleName: old.ruleName,
      assignedByUserId: byUserId,
      dueAt: old.dueAt,
    });
    const name = await this.nameOf(toUserId);
    await activityService.addTimeline(old.entityType, old.recordId, 'assigned', `Reassigned to ${name}`, byUserId);
    return created;
  }

  /** Resolve a userId to a display name (used for timeline messages). */
  async nameOf(userId: string): Promise<string> {
    const u = await this.users.findById(userId);
    return u?.displayName ?? u?.username ?? 'user';
  }

  private async enrich(rows: Assignment[]): Promise<AssignmentView[]> {
    const ids = [
      ...new Set(rows.flatMap((r) => [r.assigneeUserId, r.assignedByUserId].filter((x): x is string => !!x))),
    ];
    const names = new Map<string, string>();
    if (ids.length) {
      const users = await this.users.find({ where: { id: In(ids) } });
      for (const u of users) names.set(u.id, u.displayName ?? u.username ?? 'user');
    }
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      recordId: r.recordId,
      assigneeUserId: r.assigneeUserId,
      assigneeName: names.get(r.assigneeUserId) ?? 'user',
      status: r.status,
      role: r.role,
      state: r.state,
      ruleName: r.ruleName,
      assignedByUserId: r.assignedByUserId,
      assignedByName: r.assignedByUserId ? (names.get(r.assignedByUserId) ?? 'user') : null,
      createdAt: r.createdAt,
      closedAt: r.closedAt,
      dueAt: r.dueAt,
    }));
  }
}

export const assignmentService = new AssignmentService();
