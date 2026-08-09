import type { Request, Response } from 'express';
import { notificationService } from './notification.service.js';

/** In-app notification feed (the bell). All routes are self-scoped to the caller. */
export const notificationController = {
  async mine(req: Request, res: Response): Promise<void> {
    const unreadOnly = req.query.unread === 'true';
    res.json({ notifications: await notificationService.forUser(req.auth!.userId, { unreadOnly }) });
  },

  async count(req: Request, res: Response): Promise<void> {
    res.json({ unread: await notificationService.unreadCount(req.auth!.userId) });
  },

  async markRead(req: Request, res: Response): Promise<void> {
    await notificationService.markRead(String(req.params.id), req.auth!.userId);
    res.json({ ok: true });
  },

  async markAllRead(req: Request, res: Response): Promise<void> {
    const n = await notificationService.markAllRead(req.auth!.userId);
    res.json({ ok: true, marked: n });
  },
};
