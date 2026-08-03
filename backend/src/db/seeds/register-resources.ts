import { isResourceTypeRegistered } from '../../modules/config/index.js';
import { registerFormResourceType, FORM_RESOURCE_TYPE } from '../../modules/form/index.js';
import {
  registerEmailTemplateResourceType,
  EMAIL_TEMPLATE_RESOURCE_TYPE,
} from '../../modules/communication/index.js';
import { registerWorkflowResourceType, WORKFLOW_RESOURCE_TYPE } from '../../modules/workflow/index.js';
import { registerPipelineResourceType, DOCUMENT_PIPELINE_RESOURCE_TYPE } from '../../modules/document/index.js';
import { registerNamingSeriesResourceType, NAMING_SERIES_RESOURCE_TYPE } from '../../modules/naming/index.js';
import { registerDashboardResourceType, MODULE_DASHBOARD_RESOURCE_TYPE } from '../../modules/dashboard/index.js';
import { registerIntegrationConfigResourceType, INTEGRATION_CONFIG_RESOURCE_TYPE } from '../../modules/integration/index.js';

/**
 * Register every configurable resource type with the config resolver. Called at
 * API startup AND by the seed runner so base definitions validate against the
 * same schemas the running app uses. Guarded so it's safe to call more than once.
 */
export function registerAllResourceTypes(): void {
  if (!isResourceTypeRegistered(FORM_RESOURCE_TYPE)) registerFormResourceType();
  if (!isResourceTypeRegistered(EMAIL_TEMPLATE_RESOURCE_TYPE)) registerEmailTemplateResourceType();
  if (!isResourceTypeRegistered(WORKFLOW_RESOURCE_TYPE)) registerWorkflowResourceType();
  if (!isResourceTypeRegistered(DOCUMENT_PIPELINE_RESOURCE_TYPE)) registerPipelineResourceType();
  if (!isResourceTypeRegistered(NAMING_SERIES_RESOURCE_TYPE)) registerNamingSeriesResourceType();
  if (!isResourceTypeRegistered(MODULE_DASHBOARD_RESOURCE_TYPE)) registerDashboardResourceType();
  if (!isResourceTypeRegistered(INTEGRATION_CONFIG_RESOURCE_TYPE)) registerIntegrationConfigResourceType();
}
