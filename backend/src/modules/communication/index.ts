/**
 * Communication module (§5.6). Configurable email templates (base + client
 * override) resolved by the config pipeline and rendered with a validated
 * variable contract. Real sending currently goes through the shared direct
 * mailer; it moves to the async worker in a later phase.
 */
export { emailService, renderTemplate, type TemplateVars } from './email-template.service.js';
export {
  registerEmailTemplateResourceType,
  EMAIL_TEMPLATE_RESOURCE_TYPE,
} from './email-template.resource.js';
export { emailTemplateSchema, type EmailTemplate } from './email-template.schema.js';
