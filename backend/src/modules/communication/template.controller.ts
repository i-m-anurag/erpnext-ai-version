import type { Request, Response } from 'express';
import { BadRequestError } from '../../shared/errors.js';
import type { TemplateVars } from './email-template.service.js';
import { emailTemplateSchema, type EmailTemplate } from './email-template.schema.js';
import { templateService } from './template.service.js';

function p(req: Request, name: string): string {
  return String(req.params[name]);
}
function varsOf(req: Request): TemplateVars {
  const v = (req.body as { vars?: unknown })?.vars;
  return v && typeof v === 'object' ? (v as TemplateVars) : {};
}
/** An inline template body (the editor's current, possibly unsaved, edits) to
 *  validate/render instead of the saved version — or undefined to use the saved one. */
function defOf(req: Request): EmailTemplate | undefined {
  const t = (req.body as { template?: unknown })?.template;
  return t && typeof t === 'object' ? emailTemplateSchema.parse({ ...(t as object), slug: p(req, 'slug') }) : undefined;
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

  /** Server-validated render (surfaces contract errors the client preview can't). */
  async preview(req: Request, res: Response): Promise<void> {
    res.json({ preview: await templateService.renderPreview(p(req, 'slug'), varsOf(req), defOf(req)) });
  },

  /** "Send test to me" — render + log the intent (dispatch deferred). */
  async testSend(req: Request, res: Response): Promise<void> {
    const to = String((req.body as { to?: unknown })?.to ?? '').trim();
    if (!to) throw new BadRequestError('a recipient address (to) is required');
    res.json({ result: await templateService.testSend(p(req, 'slug'), to, varsOf(req), defOf(req)) });
  },
};
