import { z } from 'zod';

/**
 * Email template definition (§5.6). Stored as a configurable resource
 * (resource_type='email_template') so it supports base + client override and is
 * resolved/cached by the config pipeline. `variables` is the declared contract:
 * the renderer refuses to send if a declared variable is not supplied, and refuses
 * any `{{placeholder}}` that isn't provided.
 */
export const emailTemplateSchema = z.object({
  slug: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  variables: z.array(z.string()).default([]),
});

export type EmailTemplate = z.infer<typeof emailTemplateSchema>;
