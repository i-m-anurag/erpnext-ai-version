import { z } from 'zod';
import { registerResourceType } from '../config/index.js';

/**
 * Per-form integration config, keyed by form slug. Enabling a capability here
 * makes the matching UI affordance appear on that form/record (e.g. "Create
 * using Collatio" on the list, or a three-way-match action on the record). Ships
 * as a configurable resource so a deployment can toggle it per slug via base or
 * client override — no code change.
 */
export const integrationConfigSchema = z.object({
  slug: z.string().min(1),
  /** Document upload → OCR create flow. `docType` is the Collatio doc_type sent. */
  collatioUpload: z
    .object({
      enabled: z.boolean().default(false),
      docType: z.string().min(1).default('document'),
    })
    .optional(),
  /** Three-way-match (validate & reconcile) action on a submitted record. */
  threeWayMatch: z
    .object({
      enabled: z.boolean().default(false),
    })
    .optional(),
});

export type IntegrationConfig = z.infer<typeof integrationConfigSchema>;

export const INTEGRATION_CONFIG_RESOURCE_TYPE = 'integration_config';

export function registerIntegrationConfigResourceType(): void {
  registerResourceType(INTEGRATION_CONFIG_RESOURCE_TYPE, {
    schema: integrationConfigSchema,
    arrayMergeKeys: {},
    ttlSeconds: 3600,
  });
}
