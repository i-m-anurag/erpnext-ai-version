import { BaseRepository } from '../../shared/base.repository.js';
import { NotFoundError } from '../../shared/errors.js';
import { ConfigResource } from '../config/config-resource.entity.js';
import { configResolver } from '../config/index.js';
import { EMAIL_TEMPLATE_RESOURCE_TYPE } from './email-template.resource.js';
import { emailTemplateSchema, type EmailTemplate } from './email-template.schema.js';
import { renderTemplate, type TemplateVars } from './email-template.service.js';
import { notificationService } from './notification.service.js';

/** Readable sample values for previews/test-sends (declared var → example). */
const SAMPLES: Record<string, string> = {
  appName: 'IQ-SMART ERP',
  userName: 'Alex Morgan',
  recordId: 'PO-2026-0001',
  state: 'Approved',
  link: 'https://app.example.com/set-password?token=…',
  expiryHours: '24',
};

export interface TemplateSummary {
  slug: string;
  subject: string;
  variables: string[];
  /** 'base' (shipped default) | 'merged' (has a UI override) */
  resolvedFrom: string;
}

/**
 * UI-facing CRUD over email templates. Reads return the EFFECTIVE (base+custom)
 * template; writes always go to the `custom` scope so shipped base defaults stay
 * intact and re-seeding never clobbers UI edits. "Reset" deletes the override.
 */
export class TemplateService {
  private readonly repo = new BaseRepository(ConfigResource);

  async list(): Promise<TemplateSummary[]> {
    const rows = await this.repo.find({
      where: { resourceType: EMAIL_TEMPLATE_RESOURCE_TYPE, status: 'active' },
    });
    const slugs = [...new Set(rows.map((r) => r.slug))].sort();
    const out: TemplateSummary[] = [];
    for (const slug of slugs) {
      const eff = await configResolver.resolve<EmailTemplate>(EMAIL_TEMPLATE_RESOURCE_TYPE, slug);
      out.push({
        slug,
        subject: eff.definition.subject,
        variables: eff.definition.variables,
        resolvedFrom: eff.resolvedFrom,
      });
    }
    return out;
  }

  async get(slug: string): Promise<EmailTemplate & { resolvedFrom: string }> {
    const eff = await configResolver.resolve<EmailTemplate>(EMAIL_TEMPLATE_RESOURCE_TYPE, slug);
    return { ...eff.definition, resolvedFrom: eff.resolvedFrom };
  }

  /** Upsert the custom-scope override for a template. */
  async save(slug: string, input: unknown): Promise<EmailTemplate> {
    const def = emailTemplateSchema.parse({ ...(input as Record<string, unknown>), slug });
    await configResolver.upsert(
      EMAIL_TEMPLATE_RESOURCE_TYPE,
      slug,
      'custom',
      def as unknown as Record<string, unknown>,
    );
    return def;
  }

  /** Remove the custom override (revert to the shipped base, if any). */
  async resetOverride(slug: string): Promise<void> {
    const custom = await this.repo.findOne({
      resourceType: EMAIL_TEMPLATE_RESOURCE_TYPE,
      slug,
      scope: 'custom',
    });
    if (!custom) throw new NotFoundError('no custom override to reset');
    await this.repo.delete(custom.id);
    await configResolver.invalidate(EMAIL_TEMPLATE_RESOURCE_TYPE, slug);
  }

  /** Server-side render preview for given variables (mirrors what gets sent). */
  preview(def: EmailTemplate, vars: TemplateVars): { subject: string; html: string; text?: string } {
    return renderTemplate(def, vars);
  }

  /** Sample values for a template's declared variables (readable placeholders). */
  private sampleVars(def: EmailTemplate): TemplateVars {
    const out: TemplateVars = {};
    for (const v of def.variables) out[v] = SAMPLES[v] ?? `‹${v}›`;
    return out;
  }

  /**
   * Render a template exactly as it would be sent — the SERVER render, which
   * enforces the variable contract (throws on a missing declared var or an
   * undeclared `{{placeholder}}`). Missing declared vars are auto-filled with
   * sample values; caller-supplied `vars` override them. Catches broken
   * placeholders before they can reach production.
   */
  async renderPreview(slug: string, vars: TemplateVars = {}, def?: EmailTemplate): Promise<{ subject: string; html: string; text?: string }> {
    const d = def ?? (await configResolver.resolve<EmailTemplate>(EMAIL_TEMPLATE_RESOURCE_TYPE, slug)).definition;
    return renderTemplate(d, { ...this.sampleVars(d), ...vars });
  }

  /**
   * "Send test to me": render the template (validating the contract) and record
   * the intent in notification_log. Actual dispatch is deferred (the email channel
   * is logged-only in this phase — see NotificationService); the rendered output
   * is returned so the caller can show exactly what would go out.
   */
  async testSend(slug: string, to: string, vars: TemplateVars = {}, def?: EmailTemplate): Promise<{ subject: string; html: string; text?: string; to: string; dispatched: false }> {
    const d = def ?? (await configResolver.resolve<EmailTemplate>(EMAIL_TEMPLATE_RESOURCE_TYPE, slug)).definition;
    const merged = { ...this.sampleVars(d), ...vars };
    const rendered = renderTemplate(d, merged); // throws on any contract violation
    // Log the intent (no purpose → not de-duplicated, so repeated test-sends all record).
    await notificationService.notify({
      channel: 'email',
      recipients: [{ email: to }],
      template: slug,
      title: rendered.subject,
      vars: merged,
    });
    return { ...rendered, to, dispatched: false };
  }
}

export const templateService = new TemplateService();
