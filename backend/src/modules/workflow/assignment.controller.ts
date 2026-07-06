import type { Request, Response } from 'express';
import { BadRequestError } from '../../shared/errors.js';
import { assignmentService } from './assignment.service.js';
import { approvalService } from './approval.service.js';

function param(req: Request, name: string): string {
  return String(req.params[name]);
}

export const assignmentController = {
  /** My worklist: GET /api/assignments/mine?status=open|closed|all */
  async mine(req: Request, res: Response): Promise<void> {
    const q = String(req.query.status ?? 'open');
    const status = q === 'closed' ? 'closed' : q === 'all' ? 'all' : 'open';
    res.json({ assignments: await assignmentService.forUser(req.auth!.userId, status) });
  },

  /** Assignment history for a record: GET /api/assignments/:master/:code */
  async forRecord(req: Request, res: Response): Promise<void> {
    res.json({ assignments: await assignmentService.forRecord(param(req, 'master'), param(req, 'code')) });
  },

  /** Reassign: POST /api/assignments/:id/reassign  { toUserId } */
  async reassign(req: Request, res: Response): Promise<void> {
    const toUserId = String((req.body as { toUserId?: unknown })?.toUserId ?? '');
    if (!toUserId) throw new BadRequestError('toUserId is required');
    res.json({ assignment: await assignmentService.reassign(param(req, 'id'), toUserId, req.auth!.userId) });
  },

  /** Approve an approval task: POST /api/assignments/:id/approve  { comment? } */
  async approve(req: Request, res: Response): Promise<void> {
    const comment = (req.body as { comment?: string })?.comment;
    res.json({ result: await approvalService.act(param(req, 'id'), req.auth!.userId, 'approved', comment) });
  },

  /** Reject an approval task: POST /api/assignments/:id/reject  { comment? } */
  async reject(req: Request, res: Response): Promise<void> {
    const comment = (req.body as { comment?: string })?.comment;
    res.json({ result: await approvalService.act(param(req, 'id'), req.auth!.userId, 'rejected', comment) });
  },
};
