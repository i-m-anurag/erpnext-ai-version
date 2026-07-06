import { z } from 'zod';

export const APPROVAL_MATRIX_RESOURCE_TYPE = 'approval_matrix';

/**
 * Authorization matrix: how much a role can approve in a branch/location. Drives
 * dynamic approval routing — a document routes to an approver whose (role, branch)
 * limit covers the document's amount.
 */
export const approvalMatrixSchema = z.object({
  slug: z.string().min(1),
  entries: z
    .array(
      z.object({
        role: z.string().min(1),
        branch: z.string().min(1),
        limit: z.number().nonnegative(),
      }),
    )
    .default([]),
});

export type ApprovalMatrix = z.infer<typeof approvalMatrixSchema>;
