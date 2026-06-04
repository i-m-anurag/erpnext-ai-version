import { configResolver } from '../config/index.js';
import { mailer } from '../../shared/mail/mailer.service.js';
import { BadRequestError } from '../../shared/errors.js';
import { EMAIL_TEMPLATE_RESOURCE_TYPE } from './email-template.resource.js';
import type { EmailTemplate } from './email-template.schema.js';

export type TemplateVars = Record<string, string | number>;

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Render a template against variables (pure — unit-testable). Enforces the
 * variable contract: every declared variable must be supplied, and every
 * `{{placeholder}}` in the body must resolve. A template can't reference data
 * that wasn't provided (§5.6).
 */
export function renderTemplate(
  tpl: EmailTemplate,
  vars: TemplateVars,
): { subject: string; html: string; text?: string } {
  for (const v of tpl.variables) {
    if (!(v in vars)) throw new BadRequestError(`email template "${tpl.slug}" missing variable: ${v}`);
  }
  const subst = (s: string): string =>
    s.replace(PLACEHOLDER, (_match, key: string) => {
      if (!(key in vars)) {
        throw new BadRequestError(`email template "${tpl.slug}" references undeclared variable: ${key}`);
      }
      return String(vars[key]);
    });

  return {
    subject: subst(tpl.subject),
    html: subst(tpl.html),
    text: tpl.text ? subst(tpl.text) : undefined,
  };
}

/**
 * Resolve a template by slug (base+override, cached), render it, and send via the
 * mailer. This is the single entry point for templated mail — auth and other
 * modules send by slug + variables, never by hardcoded body.
 */
export class EmailService {
  async send(slug: string, to: string, vars: TemplateVars): Promise<void> {
    const eff = await configResolver.resolve<EmailTemplate>(EMAIL_TEMPLATE_RESOURCE_TYPE, slug);
    const rendered = renderTemplate(eff.definition, vars);
    await mailer.send({ to, ...rendered });
  }
}

export const emailService = new EmailService();
