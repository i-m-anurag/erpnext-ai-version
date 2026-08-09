import type { Request, Response } from 'express';
import { BadRequestError } from '../../shared/errors.js';
import { assignmentService } from './assignment.service.js';

function p(req: Request, name: string): string {
  return String(req.params[name]);
}

export const assignmentController = {
  /** The caller's own worklist (self-scoped — no cross-user access). */
  async mine(req: Request, res: Response): Promise<void> {
    const status = req.query.status === 'closed' ? 'closed' : 'open';
    res.json({ assignments: await assignmentService.forUser(req.auth!.userId, { status }) });
  },

  /** A record's full assignment history (who it was with, in order). */
  async forRecord(req: Request, res: Response): Promise<void> {
    res.json({ assignments: await assignmentService.forRecord(p(req, 'masterSlug'), p(req, 'recordId')) });
  },

  /** Reassign an open assignment to another user (closes the old, opens a new). */
  async reassign(req: Request, res: Response): Promise<void> {
    const toUserId = String((req.body as { toUserId?: unknown })?.toUserId ?? '').trim();
    if (!toUserId) throw new BadRequestError('toUserId is required');
    const created = await assignmentService.reassign(p(req, 'id'), toUserId, req.auth!.userId);
    res.json({ assignment: created });
  },
};
