import { registerResourceType } from '../config/index.js';
import { formDefinitionSchema } from './form.schema.js';

/** Resource type slug for forms in the config pipeline. */
export const FORM_RESOURCE_TYPE = 'form';

/**
 * Register 'form' with the generic config resolver. Form `fields` (and a field's
 * `options`) merge by their identity key so a client override can patch a single
 * field without restating the whole array (§3.4 / §5.1).
 */
export function registerFormResourceType(): void {
  registerResourceType(FORM_RESOURCE_TYPE, {
    schema: formDefinitionSchema,
    arrayMergeKeys: { fields: 'key', options: 'value' },
    ttlSeconds: 3600,
  });
}
