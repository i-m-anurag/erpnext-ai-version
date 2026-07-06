import { registerResourceType } from '../config/index.js';
import { approvalMatrixSchema, APPROVAL_MATRIX_RESOURCE_TYPE } from './approval-matrix.schema.js';

export { APPROVAL_MATRIX_RESOURCE_TYPE };

/** Register 'approval_matrix' with the config resolver (whole-definition override). */
export function registerApprovalMatrixResourceType(): void {
  registerResourceType(APPROVAL_MATRIX_RESOURCE_TYPE, {
    schema: approvalMatrixSchema,
    arrayMergeKeys: {},
    ttlSeconds: 3600,
  });
}
