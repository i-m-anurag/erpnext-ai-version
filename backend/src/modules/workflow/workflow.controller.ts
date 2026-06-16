import type { Request, Response } from 'express';
import { BadRequestError } from '../../shared/errors.js';
import { activityService } from '../activity/index.js';
import { publish } from '../../queue/events.js';
import { workflowService } from './workflow.service.js';

function p(req: Request, name: string): string {
  return String(req.params[name]);
}

export const workflowController = {
  async status(req: Request, res: Response): Promise<void> {
    res.json(await workflowService.status(p(req, 'masterSlug'), p(req, 'recordId'), req.auth!.userId));
  },

  async transition(req: Request, res: Response): Promise<void> {
    const action = String((req.body as { action?: unknown })?.action ?? '').trim();
    if (!action) throw new BadRequestError('action is required');
    const slug = p(req, 'masterSlug');
    const code = p(req, 'recordId');
    const userId = req.auth!.userId;
    const result = await workflowService.runAction(slug, code, action, userId);

    if (result.stateChanged) {
      await activityService.addTimeline(slug, code, 'state_changed', `${result.action}: ${result.from} → ${result.to}`, userId);
      await publish({
        type: 'master.state_changed',
        entityType: slug,
        recordId: code,
        actorUserId: userId,
        fromState: result.from,
        toState: result.to,
      });
    } else {
      await activityService.addTimeline(slug, code, 'updated', `Action: ${result.action}`, userId);
    }
    res.json(result);
  },
};
