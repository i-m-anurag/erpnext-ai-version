import { isResourceTypeRegistered } from '../../modules/config/index.js';
import { registerFormResourceType, FORM_RESOURCE_TYPE } from '../../modules/form/index.js';
import {
  registerEmailTemplateResourceType,
  EMAIL_TEMPLATE_RESOURCE_TYPE,
} from '../../modules/communication/index.js';

/**
 * Register every configurable resource type with the config resolver. Called at
 * API startup AND by the seed runner so base definitions validate against the
 * same schemas the running app uses. Guarded so it's safe to call more than once.
 */
export function registerAllResourceTypes(): void {
  if (!isResourceTypeRegistered(FORM_RESOURCE_TYPE)) registerFormResourceType();
  if (!isResourceTypeRegistered(EMAIL_TEMPLATE_RESOURCE_TYPE)) registerEmailTemplateResourceType();
  // master_schema, workflow register here as those modules land.
}
