import { registerResourceType } from '../config/index.js';
import { emailTemplateSchema } from './email-template.schema.js';

/** Resource type slug for email templates in the config pipeline. */
export const EMAIL_TEMPLATE_RESOURCE_TYPE = 'email_template';

/** Register 'email_template' with the generic config resolver (base + override). */
export function registerEmailTemplateResourceType(): void {
  registerResourceType(EMAIL_TEMPLATE_RESOURCE_TYPE, {
    schema: emailTemplateSchema,
    ttlSeconds: 3600,
  });
}
