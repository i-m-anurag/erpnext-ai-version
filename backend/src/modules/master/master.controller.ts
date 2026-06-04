import type { Request, Response } from 'express';
import { masterService } from './master.service.js';

function param(req: Request, name: string): string {
  return String(req.params[name]);
}
function body(req: Request): Record<string, unknown> {
  return (req.body ?? {}) as Record<string, unknown>;
}

export const masterController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.json({ masters: await masterService.list() });
  },
  async get(req: Request, res: Response): Promise<void> {
    res.json({ master: await masterService.getRegistry(param(req, 'slug')) });
  },
  async options(req: Request, res: Response): Promise<void> {
    res.json({ options: await masterService.getOptions(param(req, 'slug')) });
  },
  async listData(req: Request, res: Response): Promise<void> {
    const limit = Number(req.query.limit ?? 100);
    const offset = Number(req.query.offset ?? 0);
    res.json({ rows: await masterService.listData(param(req, 'slug'), limit, offset) });
  },
  async createData(req: Request, res: Response): Promise<void> {
    const row = await masterService.createData(param(req, 'slug'), body(req));
    res.status(201).json({ row });
  },
  async updateData(req: Request, res: Response): Promise<void> {
    const row = await masterService.updateData(param(req, 'slug'), param(req, 'id'), body(req));
    res.json({ row });
  },
  async deleteData(req: Request, res: Response): Promise<void> {
    await masterService.deleteData(param(req, 'slug'), param(req, 'id'));
    res.json({ ok: true });
  },
};
