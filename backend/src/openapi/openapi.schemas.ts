import { z } from 'zod';

/**
 * Response-shape schemas, defined in Zod so the docs are generated, not
 * hand-maintained. Request schemas are imported directly from the modules.
 */

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: 'Error' });

export const okSchema = z.object({ ok: z.boolean() }).meta({ id: 'Ok' });

export const publicUserSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string(),
    displayName: z.string().nullable(),
    status: z.string(),
    isFirstLogin: z.boolean(),
  })
  .meta({ id: 'PublicUser' });

export const loginResponseSchema = z
  .object({
    accessToken: z.string(),
    accessTokenExpiresIn: z.number().int(),
    user: publicUserSchema,
  })
  .meta({ id: 'LoginResponse' });

export const accessTokenResponseSchema = z
  .object({
    accessToken: z.string(),
    accessTokenExpiresIn: z.number().int(),
  })
  .meta({ id: 'AccessTokenResponse' });

export const meResponseSchema = z
  .object({
    user: publicUserSchema,
    permissions: z.array(z.string()),
    branchId: z.string().nullable(),
  })
  .meta({ id: 'MeResponse' });

export const permissionSchema = z
  .object({
    id: z.string().uuid(),
    module: z.string(),
    action: z.string(),
    description: z.string().nullable(),
  })
  .meta({ id: 'Permission' });

export const roleSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    status: z.string(),
  })
  .meta({ id: 'Role' });

export const permissionsListSchema = z
  .object({ permissions: z.array(permissionSchema) })
  .meta({ id: 'PermissionsList' });

export const rolesListSchema = z.object({ roles: z.array(roleSchema) }).meta({ id: 'RolesList' });

export const userPermissionsSchema = z
  .object({ userId: z.string().uuid(), permissions: z.array(z.string()) })
  .meta({ id: 'UserPermissions' });

export const healthSchema = z.object({ status: z.string() }).meta({ id: 'Health' });

export const readySchema = z
  .object({
    status: z.string(),
    checks: z.object({ db: z.string(), redis: z.string() }),
  })
  .meta({ id: 'Ready' });

export const metaSchema = z
  .object({
    name: z.string(),
    env: z.string(),
    modules: z.record(z.string(), z.boolean()),
    branding: z.object({ productName: z.string(), logoUrl: z.string() }),
  })
  .meta({ id: 'Meta' });

// ── Forms & masters ──────────────────────────────────────────────────────────

export const formResolvedSchema = z
  .object({
    slug: z.string(),
    version: z.number().int(),
    resolvedFrom: z.enum(['base', 'merged']),
    form: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'FormResolved' });

export const publicFormSchema = z
  .object({
    slug: z.string(),
    version: z.number().int(),
    form: z.record(z.string(), z.unknown()),
  })
  .meta({ id: 'PublicForm' });

export const masterRegistrySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
    managedBy: z.enum(['seeded', 'ui']),
    editable: z.boolean(),
    formSlug: z.string().nullable(),
    codeField: z.string(),
    labelField: z.string(),
    cacheTtlSeconds: z.number().int(),
    status: z.string(),
  })
  .meta({ id: 'MasterRegistry' });

export const mastersListSchema = z
  .object({ masters: z.array(masterRegistrySchema) })
  .meta({ id: 'MastersList' });

export const masterOptionsSchema = z
  .object({ options: z.array(z.object({ value: z.string(), label: z.string() })) })
  .meta({ id: 'MasterOptions' });

export const masterRowSchema = z
  .object({
    id: z.string().uuid(),
    masterSlug: z.string(),
    code: z.string(),
    data: z.record(z.string(), z.unknown()),
    status: z.string(),
  })
  .meta({ id: 'MasterRow' });

export const masterRowsSchema = z.object({ rows: z.array(masterRowSchema) }).meta({ id: 'MasterRows' });

/** Master row create/update body — shape is the master's form; free-form here. */
export const masterDataInputSchema = z.record(z.string(), z.unknown()).meta({ id: 'MasterDataInput' });
