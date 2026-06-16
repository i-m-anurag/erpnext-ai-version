import type { Request, Response } from 'express';
import { templateService } from './template.service.js';

function p(req: Request, name: string): string {
  return String(req.params[name]);
}

export const templateController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.json({ templates: await templateService.list() });
  },
  async get(req: Request, res: Response): Promise<void> {
    res.json({ template: await templateService.get(p(req, 'slug')) });
  },
  async save(req: Request, res: Response): Promise<void> {
    const template = await templateService.save(p(req, 'slug'), req.body);
    res.json({ template });
  },
  async reset(req: Request, res: Response): Promise<void> {
    await templateService.resetOverride(p(req, 'slug'));
    res.json({ ok: true });
  },
};
