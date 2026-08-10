import type { Request, Response } from 'express';
import { masterService } from './master.service.js';
import { itemTaxService } from './item-tax.service.js';
import { workflowService } from '../workflow/index.js';
import { activityService } from '../activity/index.js';
import { publish } from '../../queue/events.js';

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
  async getRecord(req: Request, res: Response): Promise<void> {
    const slug = param(req, 'slug');
    const code = param(req, 'code');
    const row = await masterService.getRecord(slug, code);
    // Opt-in expansion (kept slug-scoped so the generic path stays clean):
    // ?expand=taxTemplates on an item embeds its resolved Item Tax Templates.
    const expand = String(req.query.expand ?? '').split(',').map((s) => s.trim());
    if (slug === 'item' && expand.includes('taxTemplates')) {
      (row as unknown as { taxTemplates?: unknown }).taxTemplates = await itemTaxService.resolveForItem(code);
    }
    res.json({ row });
  },
  async createData(req: Request, res: Response): Promise<void> {
    const slug = param(req, 'slug');
    const draft = req.query.draft === 'true';
    const row = await masterService.createData(slug, body(req), draft);
    await activityService.addTimeline(slug, row.code, 'created', draft ? 'Draft created' : 'Record created', req.auth?.userId ?? null);
    await publish({ type: 'master.created', entityType: slug, recordId: row.code, actorUserId: req.auth?.userId ?? null });
    res.status(201).json({ row });
  },
  async updateData(req: Request, res: Response): Promise<void> {
    const slug = param(req, 'slug');
    const draft = req.query.draft === 'true';
    // Workflow-owned editability: reject edits when the record's state is not editable
    // (enforced at the API boundary so internal service cascades still work).
    await workflowService.assertEditable(slug, param(req, 'id'));
    const row = await masterService.updateData(slug, param(req, 'id'), body(req), draft);
    await activityService.addTimeline(slug, row.code, 'updated', draft ? 'Saved as draft' : 'Record updated', req.auth?.userId ?? null);
    await publish({ type: 'master.updated', entityType: slug, recordId: row.code, actorUserId: req.auth?.userId ?? null });
    res.json({ row });
  },
  async deleteData(req: Request, res: Response): Promise<void> {
    await masterService.deleteData(param(req, 'slug'), param(req, 'id'));
    res.json({ ok: true });
  },
};
