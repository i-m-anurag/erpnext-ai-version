import type { Request, Response } from 'express';
import { BadRequestError } from '../../shared/errors.js';
import { activityService } from './activity.service.js';

function p(req: Request, name: string): string {
  return String(req.params[name]);
}

export const activityController = {
  async timeline(req: Request, res: Response): Promise<void> {
    res.json({ timeline: await activityService.listTimeline(p(req, 'entityType'), p(req, 'recordId')) });
  },

  async listComments(req: Request, res: Response): Promise<void> {
    res.json({ comments: await activityService.listComments(p(req, 'entityType'), p(req, 'recordId')) });
  },

  async addComment(req: Request, res: Response): Promise<void> {
    const body = String((req.body as { body?: unknown })?.body ?? '').trim();
    if (!body) throw new BadRequestError('Comment body is required');
    const comment = await activityService.addComment(
      p(req, 'entityType'),
      p(req, 'recordId'),
      body,
      req.auth!.userId,
    );
    res.status(201).json({ comment });
  },
};
