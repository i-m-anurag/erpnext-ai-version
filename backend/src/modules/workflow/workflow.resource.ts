import { registerResourceType } from '../config/index.js';
import { workflowDefinitionSchema } from './workflow.schema.js';

export const WORKFLOW_RESOURCE_TYPE = 'workflow';

/** Register 'workflow' with the config resolver (states/transitions merge by id). */
export function registerWorkflowResourceType(): void {
  registerResourceType(WORKFLOW_RESOURCE_TYPE, {
    schema: workflowDefinitionSchema,
    // No merge keys → a custom override REPLACES states/rules wholesale (the UI
    // edits the whole definition), rather than element-merging by id.
    arrayMergeKeys: {},
    ttlSeconds: 3600,
  });
}
