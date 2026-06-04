import { z } from 'zod';

export const createRoleSchema = z.object({
  code: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, - or _'),
  name: z.string().min(1).max(128),
  description: z.string().max(255).optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const setRolePermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()).max(500),
});
export type SetRolePermissionsInput = z.infer<typeof setRolePermissionsSchema>;

export const assignRoleSchema = z.object({
  roleId: z.string().uuid(),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
