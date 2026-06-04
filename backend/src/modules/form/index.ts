/**
 * Form module (Phase-1 foundation). Provides the JSON form-definition schema and
 * registers 'form' as a configurable resource type so base form definitions can
 * be seeded and resolved via the config pipeline. The dynamic renderer, field-type
 * registry, and master-lookup resolution arrive in Phase 2.
 */
export { formDefinitionSchema, type FormDefinition } from './form.schema.js';
export { registerFormResourceType, FORM_RESOURCE_TYPE } from './form.resource.js';
export { validateFormData } from './form.validation.js';
export { formService } from './form.service.js';
export { buildFormRouter } from './form.routes.js';
export { buildPublicFormRouter } from './form.public.routes.js';
