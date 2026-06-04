import { z } from 'zod';

/** seed-data/base/permissions/<module>.json */
export const permissionsFileSchema = z.object({
  module: z.string().min(1),
  permissions: z.array(z.object({ action: z.string().min(1), description: z.string() })),
});

/** seed-data/base/roles/<code>.json */
export const roleFileSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  isSystem: z.boolean().optional(),
  /** "all", explicit "module:action" keys, or glob patterns (* per segment). */
  permissions: z.union([z.literal('all'), z.array(z.string())]),
});

/** seed-data/base/masters/<slug>.json */
export const masterFileSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  managedBy: z.enum(['seeded', 'ui']),
  editable: z.boolean(),
  formSlug: z.string().optional(),
  cacheTtlSeconds: z.number().int().positive().optional(),
  /** which data field is the row's natural key / option value (default "code") */
  codeField: z.string().optional(),
  /** which data field is the option label (default "name") */
  labelField: z.string().optional(),
  /** seeded master rows (for managedBy: "seeded" reference data) */
  data: z.array(z.record(z.string(), z.unknown())).optional(),
});

export type PermissionsFile = z.infer<typeof permissionsFileSchema>;
export type RoleFile = z.infer<typeof roleFileSchema>;
export type MasterFile = z.infer<typeof masterFileSchema>;
