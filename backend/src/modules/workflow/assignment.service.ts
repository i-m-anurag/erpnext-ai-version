import { In } from 'typeorm';
import { BaseRepository } from '../../shared/base.repository.js';
import { BadRequestError, NotFoundError } from '../../shared/errors.js';
import { activityService } from '../activity/index.js';
import { User } from '../auth/user.entity.js';
import { Assignment } from './assignment.entity.js';

/** A hydrated assignment (user ids resolved to display names) for the UI. */
export interface AssignmentView {
  id: string;
  entityType: string;
  recordId: string;
  assigneeUserId: string;
  assigneeName: string;
  role: string | null;
  state: string | null;
  status: 'open' | 'closed';
  ruleName: string | null;
  assignedByUserId: string | null;
  assignedByName: string | null;
  createdAt: Date;
  closedAt: Date | null;
}

/**
 * Reads and manages workflow assignments (the `assign` action creates them). The
 * table is append-only in spirit: assignments are CLOSED, never deleted, so the
 * rows for a record are its assignment history across roles/steps.
 */
export class AssignmentService {
  private readonly repo = new BaseRepository(Assignment);
  private readonly users = new BaseRepository(User);

  /** A user's worklist. `status` = 'open' (default), 'closed', or 'all'. */
  async forUser(userId: string, status: 'open' | 'closed' | 'all' = 'open'): Promise<AssignmentView[]> {
    const where = status === 'all' ? { assigneeUserId: userId } : { assigneeUserId: userId, status };
    const rows = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return this.hydrate(rows);
  }

  /** Full assignment history for one record, newest first. */
  async forRecord(entityType: string, recordId: string): Promise<AssignmentView[]> {
    const rows = await this.repo.find({ where: { entityType, recordId }, order: { createdAt: 'DESC' } });
    return this.hydrate(rows);
  }

  /** The current open assignee of a record (latest open assignment), or null. */
  async activeAssignee(entityType: string, recordId: string): Promise<string | null> {
    const row = await this.repo.findOne(
      { entityType, recordId, status: 'open' },
      { order: { createdAt: 'DESC' } },
    );
    return row?.assigneeUserId ?? null;
  }

  /** Ids of the currently open assignments for a record (used by close-on-transition). */
  async openIdsFor(entityType: string, recordId: string): Promise<string[]> {
    const rows = await this.repo.find({ where: { entityType, recordId, status: 'open' } });
    return rows.map((r) => r.id);
  }

  /** Close a set of assignments (marks status + closedAt; never deletes). */
  async closeByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const rows = await this.repo.find({ where: { id: In(ids), status: 'open' } });
    const now = new Date();
    for (const r of rows) {
      r.status = 'closed';
      r.closedAt = now;
      await this.repo.save(r);
    }
  }

  /** Reassign: close the current assignment and open a fresh one for another user. */
  async reassign(id: string, toUserId: string, byUserId: string): Promise<AssignmentView> {
    const cur = await this.repo.findById(id);
    if (!cur) throw new NotFoundError('assignment not found');
    if (cur.status === 'closed') throw new BadRequestError('assignment is already closed');
    if (cur.assigneeUserId === toUserId) throw new BadRequestError('already assigned to that user');

    cur.status = 'closed';
    cur.closedAt = new Date();
    await this.repo.save(cur);

    const next = await this.repo.save(
      this.repo.create({
        entityType: cur.entityType,
        recordId: cur.recordId,
        assigneeUserId: toUserId,
        status: 'open',
        ruleName: cur.ruleName,
        role: cur.role,
        state: cur.state,
        assignedByUserId: byUserId,
      }),
    );

    const [fromName, toName] = [await this.nameOf(cur.assigneeUserId), await this.nameOf(toUserId)];
    await activityService.addTimeline(
      cur.entityType,
      cur.recordId,
      'assigned',
      `Reassigned from ${fromName} to ${toName}`,
      byUserId,
    );
    return (await this.hydrate([next]))[0]!;
  }

  // ── internals ──────────────────────────────────────────────────────────────
  private async hydrate(rows: Assignment[]): Promise<AssignmentView[]> {
    const ids = [
      ...new Set(rows.flatMap((r) => [r.assigneeUserId, r.assignedByUserId].filter(Boolean) as string[])),
    ];
    const names = await this.namesFor(ids);
    return rows.map((r) => ({
      id: r.id,
      entityType: r.entityType,
      recordId: r.recordId,
      assigneeUserId: r.assigneeUserId,
      assigneeName: names.get(r.assigneeUserId) ?? 'user',
      role: r.role,
      state: r.state,
      status: r.status,
      ruleName: r.ruleName,
      assignedByUserId: r.assignedByUserId,
      assignedByName: r.assignedByUserId ? (names.get(r.assignedByUserId) ?? null) : null,
      createdAt: r.createdAt,
      closedAt: r.closedAt,
    }));
  }

  private async namesFor(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const us = await this.users.find({ where: { id: In(ids) } });
    return new Map(us.map((u) => [u.id, u.displayName ?? u.username]));
  }

  private async nameOf(id: string): Promise<string> {
    const u = await this.users.findById(id);
    return u?.displayName ?? u?.username ?? 'user';
  }
}

export const assignmentService = new AssignmentService();
