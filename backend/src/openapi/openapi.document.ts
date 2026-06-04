import type { ZodType } from 'zod';
import { env } from '../config/env.js';
import { toSchema, jsonBody, jsonResponse, errorResponse } from './helpers.js';
import { loginSchema, forgotPasswordSchema, setPasswordSchema } from '../modules/auth/auth.schemas.js';
import {
  createRoleSchema,
  setRolePermissionsSchema,
  assignRoleSchema,
} from '../modules/permission/permission.schemas.js';
import {
  errorSchema,
  okSchema,
  publicUserSchema,
  loginResponseSchema,
  accessTokenResponseSchema,
  meResponseSchema,
  permissionSchema,
  roleSchema,
  permissionsListSchema,
  rolesListSchema,
  userPermissionsSchema,
  healthSchema,
  readySchema,
  metaSchema,
  formResolvedSchema,
  publicFormSchema,
  masterRegistrySchema,
  mastersListSchema,
  masterOptionsSchema,
  masterRowSchema,
  masterRowsSchema,
  masterDataInputSchema,
} from './openapi.schemas.js';

/** Component schemas: [name, zod, io]. */
const COMPONENTS: [string, ZodType, 'input' | 'output'][] = [
  // requests
  ['LoginRequest', loginSchema, 'input'],
  ['ForgotPasswordRequest', forgotPasswordSchema, 'input'],
  ['SetPasswordRequest', setPasswordSchema, 'input'],
  ['CreateRoleRequest', createRoleSchema, 'input'],
  ['SetRolePermissionsRequest', setRolePermissionsSchema, 'input'],
  ['AssignRoleRequest', assignRoleSchema, 'input'],
  // responses
  ['Error', errorSchema, 'output'],
  ['Ok', okSchema, 'output'],
  ['PublicUser', publicUserSchema, 'output'],
  ['LoginResponse', loginResponseSchema, 'output'],
  ['AccessTokenResponse', accessTokenResponseSchema, 'output'],
  ['MeResponse', meResponseSchema, 'output'],
  ['Permission', permissionSchema, 'output'],
  ['Role', roleSchema, 'output'],
  ['PermissionsList', permissionsListSchema, 'output'],
  ['RolesList', rolesListSchema, 'output'],
  ['UserPermissions', userPermissionsSchema, 'output'],
  ['Health', healthSchema, 'output'],
  ['Ready', readySchema, 'output'],
  ['Meta', metaSchema, 'output'],
  ['FormResolved', formResolvedSchema, 'output'],
  ['PublicForm', publicFormSchema, 'output'],
  ['MasterRegistry', masterRegistrySchema, 'output'],
  ['MastersList', mastersListSchema, 'output'],
  ['MasterOptions', masterOptionsSchema, 'output'],
  ['MasterRow', masterRowSchema, 'output'],
  ['MasterRows', masterRowsSchema, 'output'],
  ['MasterDataInput', masterDataInputSchema, 'input'],
];

const bearer = [{ bearerAuth: [] }];
const uuidParam = (name: string): Record<string, unknown> => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
});
const slugParam = (name: string): Record<string, unknown> => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
});

/** Build the full OpenAPI 3.0 document. */
export function buildOpenApiDocument(): Record<string, unknown> {
  const schemas: Record<string, unknown> = {};
  for (const [name, zod, io] of COMPONENTS) {
    schemas[name] = toSchema(zod, io);
  }

  return {
    openapi: '3.0.3',
    info: {
      title: `${env.app.name} API`,
      version: '0.1.0',
      description:
        'White-label ERP — backend API. Auth uses a short-lived access token (Authorization: Bearer) ' +
        'plus a rotating refresh token in an httpOnly cookie. Permission-guarded routes require the ' +
        'noted `module:action` permission.',
    },
    servers: [{ url: env.app.publicUrl, description: env.nodeEnv }],
    tags: [
      { name: 'Health', description: 'Liveness, readiness, deployment metadata' },
      { name: 'Auth', description: 'Login, sessions, password flows (§5.2)' },
      { name: 'Permissions', description: 'RBAC administration (§5.4)' },
      { name: 'Forms', description: 'Resolved form definitions (§5.1)' },
      { name: 'Masters', description: 'Master registry + generic master data (§5.5)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        refreshCookie: { type: 'apiKey', in: 'cookie', name: 'erp_rt' },
      },
      schemas,
    },
    paths: {
      '/healthz': {
        get: {
          tags: ['Health'],
          summary: 'Liveness probe',
          operationId: 'healthz',
          security: [],
          responses: { '200': jsonResponse('Process is up', 'Health') },
        },
      },
      '/readyz': {
        get: {
          tags: ['Health'],
          summary: 'Readiness probe (DB + Redis)',
          operationId: 'readyz',
          security: [],
          responses: {
            '200': jsonResponse('All dependencies reachable', 'Ready'),
            '503': jsonResponse('One or more dependencies down', 'Ready'),
          },
        },
      },
      '/meta': {
        get: {
          tags: ['Health'],
          summary: 'Deployment name, env, and enabled modules',
          operationId: 'meta',
          security: [],
          responses: { '200': jsonResponse('Deployment metadata', 'Meta') },
        },
      },

      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Password login',
          description: 'Returns an access token and sets the httpOnly refresh cookie. Rate-limited.',
          operationId: 'login',
          security: [],
          requestBody: jsonBody('LoginRequest'),
          responses: {
            '200': jsonResponse('Logged in', 'LoginResponse'),
            '400': errorResponse('Validation error'),
            '401': errorResponse('Invalid credentials'),
            '429': errorResponse('Too many attempts'),
          },
        },
      },
      '/api/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate tokens using the refresh cookie',
          description: 'Reads the httpOnly refresh cookie, rotates it, and returns a new access token. Reuse of a superseded token revokes the session.',
          operationId: 'refresh',
          security: [{ refreshCookie: [] }],
          responses: {
            '200': jsonResponse('Rotated', 'AccessTokenResponse'),
            '401': errorResponse('Missing/invalid/expired refresh token or reuse detected'),
          },
        },
      },
      '/api/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout (revoke session, clear cookie)',
          operationId: 'logout',
          security: bearer,
          responses: { '200': jsonResponse('Logged out', 'Ok'), '401': errorResponse('Not authenticated') },
        },
      },
      '/api/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request a password-reset email',
          description: 'Always returns 200 (does not reveal whether the email exists). Rate-limited.',
          operationId: 'forgotPassword',
          security: [],
          requestBody: jsonBody('ForgotPasswordRequest'),
          responses: { '200': jsonResponse('Accepted', 'Ok'), '400': errorResponse('Validation error') },
        },
      },
      '/api/auth/set-password': {
        post: {
          tags: ['Auth'],
          summary: 'Set a password via a welcome/reset token',
          description: 'Consumes a single-use token and sets the password; revokes existing sessions. Rate-limited.',
          operationId: 'setPassword',
          security: [],
          requestBody: jsonBody('SetPasswordRequest'),
          responses: {
            '200': jsonResponse('Password set', 'Ok'),
            '400': errorResponse('Invalid/expired token or weak password'),
          },
        },
      },
      '/api/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current user, permission snapshot, and branch context',
          operationId: 'me',
          security: bearer,
          responses: { '200': jsonResponse('Current session', 'MeResponse'), '401': errorResponse('Not authenticated') },
        },
      },

      '/api/permissions/permissions': {
        get: {
          tags: ['Permissions'],
          summary: 'List the permission catalog',
          description: 'Requires permission `permission:permission.read`.',
          operationId: 'listPermissions',
          security: bearer,
          responses: {
            '200': jsonResponse('Permission catalog', 'PermissionsList'),
            '401': errorResponse('Not authenticated'),
            '403': errorResponse('Missing permission'),
          },
        },
      },
      '/api/permissions/roles': {
        get: {
          tags: ['Permissions'],
          summary: 'List roles',
          description: 'Requires permission `permission:role.read`.',
          operationId: 'listRoles',
          security: bearer,
          responses: {
            '200': jsonResponse('Roles', 'RolesList'),
            '401': errorResponse('Not authenticated'),
            '403': errorResponse('Missing permission'),
          },
        },
        post: {
          tags: ['Permissions'],
          summary: 'Create a role',
          description: 'Requires permission `permission:role.create`.',
          operationId: 'createRole',
          security: bearer,
          requestBody: jsonBody('CreateRoleRequest'),
          responses: {
            '201': jsonResponse('Created', 'Role'),
            '400': errorResponse('Validation error'),
            '403': errorResponse('Missing permission'),
            '409': errorResponse('Role already exists'),
          },
        },
      },
      '/api/permissions/roles/{roleId}': {
        delete: {
          tags: ['Permissions'],
          summary: 'Delete a non-system role',
          description: 'Requires permission `permission:role.delete`.',
          operationId: 'deleteRole',
          security: bearer,
          parameters: [uuidParam('roleId')],
          responses: {
            '200': jsonResponse('Deleted', 'Ok'),
            '403': errorResponse('Missing permission or system role'),
            '404': errorResponse('Role not found'),
          },
        },
      },
      '/api/permissions/roles/{roleId}/permissions': {
        put: {
          tags: ['Permissions'],
          summary: 'Replace a role’s permissions',
          description: 'Requires permission `permission:role.update`. Propagates to live sessions.',
          operationId: 'setRolePermissions',
          security: bearer,
          parameters: [uuidParam('roleId')],
          requestBody: jsonBody('SetRolePermissionsRequest'),
          responses: {
            '200': jsonResponse('Updated', 'Ok'),
            '400': errorResponse('Validation error'),
            '403': errorResponse('Missing permission'),
            '404': errorResponse('Role not found'),
          },
        },
      },
      '/api/permissions/users/{userId}/permissions': {
        get: {
          tags: ['Permissions'],
          summary: 'Effective permissions for a user',
          description: 'Requires permission `permission:role.read`.',
          operationId: 'getUserPermissions',
          security: bearer,
          parameters: [uuidParam('userId')],
          responses: {
            '200': jsonResponse('Effective permissions', 'UserPermissions'),
            '403': errorResponse('Missing permission'),
          },
        },
      },
      '/api/permissions/users/{userId}/roles': {
        post: {
          tags: ['Permissions'],
          summary: 'Assign a role to a user',
          description: 'Requires permission `permission:role.assign`.',
          operationId: 'assignRole',
          security: bearer,
          parameters: [uuidParam('userId')],
          requestBody: jsonBody('AssignRoleRequest'),
          responses: {
            '200': jsonResponse('Assigned', 'Ok'),
            '403': errorResponse('Missing permission'),
            '404': errorResponse('Role not found'),
          },
        },
      },
      '/api/permissions/users/{userId}/roles/{roleId}': {
        delete: {
          tags: ['Permissions'],
          summary: 'Remove a role from a user',
          description: 'Requires permission `permission:role.assign`.',
          operationId: 'removeRole',
          security: bearer,
          parameters: [uuidParam('userId'), uuidParam('roleId')],
          responses: {
            '200': jsonResponse('Removed', 'Ok'),
            '403': errorResponse('Missing permission'),
          },
        },
      },

      '/api/public/forms/{slug}': {
        get: {
          tags: ['Forms'],
          summary: 'Public form definition (unauthenticated)',
          description:
            'Serves ONLY forms flagged `public: true` (e.g. the login form). Non-public or unknown slugs return 404 (no existence leak). Rate-limited.',
          operationId: 'getPublicForm',
          security: [],
          parameters: [slugParam('slug')],
          responses: {
            '200': jsonResponse('Public form', 'PublicForm'),
            '404': errorResponse('Not a public form'),
            '429': errorResponse('Too many requests'),
          },
        },
      },
      '/api/forms/{slug}': {
        get: {
          tags: ['Forms'],
          summary: 'Resolved (base+override) form definition',
          description: 'Requires permission `form:view`.',
          operationId: 'getForm',
          security: bearer,
          parameters: [slugParam('slug')],
          responses: {
            '200': jsonResponse('Effective form', 'FormResolved'),
            '403': errorResponse('Missing permission'),
            '404': errorResponse('Form not found'),
          },
        },
      },

      '/api/masters': {
        get: {
          tags: ['Masters'],
          summary: 'List the master registry',
          description: 'Requires permission `master:view`.',
          operationId: 'listMasters',
          security: bearer,
          responses: {
            '200': jsonResponse('Masters', 'MastersList'),
            '403': errorResponse('Missing permission'),
          },
        },
      },
      '/api/masters/{slug}': {
        get: {
          tags: ['Masters'],
          summary: 'A master registry entry',
          description: 'Requires permission `master:view`.',
          operationId: 'getMaster',
          security: bearer,
          parameters: [slugParam('slug')],
          responses: {
            '200': jsonResponse('Master', 'MasterRegistry'),
            '403': errorResponse('Missing permission'),
            '404': errorResponse('Master not found'),
          },
        },
      },
      '/api/masters/{slug}/options': {
        get: {
          tags: ['Masters'],
          summary: 'Dropdown options (value=code, label) for a master',
          description: 'Requires permission `master:view`. Cached.',
          operationId: 'getMasterOptions',
          security: bearer,
          parameters: [slugParam('slug')],
          responses: {
            '200': jsonResponse('Options', 'MasterOptions'),
            '403': errorResponse('Missing permission'),
          },
        },
      },
      '/api/masters/{slug}/data': {
        get: {
          tags: ['Masters'],
          summary: 'List master rows (paginated)',
          description: 'Requires permission `master:view`.',
          operationId: 'listMasterData',
          security: bearer,
          parameters: [
            slugParam('slug'),
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
            { name: 'offset', in: 'query', required: false, schema: { type: 'integer' } },
          ],
          responses: {
            '200': jsonResponse('Rows', 'MasterRows'),
            '403': errorResponse('Missing permission'),
          },
        },
        post: {
          tags: ['Masters'],
          summary: 'Create a master row (validated against the master’s form)',
          description: 'Requires permission `master:create`. Seeded/read-only masters reject writes (403).',
          operationId: 'createMasterData',
          security: bearer,
          parameters: [slugParam('slug')],
          requestBody: jsonBody('MasterDataInput'),
          responses: {
            '201': jsonResponse('Created', 'MasterRow'),
            '400': errorResponse('Validation error'),
            '403': errorResponse('Missing permission or read-only master'),
            '409': errorResponse('Duplicate code'),
          },
        },
      },
      '/api/masters/{slug}/data/{id}': {
        put: {
          tags: ['Masters'],
          summary: 'Update a master row',
          description: 'Requires permission `master:update`.',
          operationId: 'updateMasterData',
          security: bearer,
          parameters: [slugParam('slug'), uuidParam('id')],
          requestBody: jsonBody('MasterDataInput'),
          responses: {
            '200': jsonResponse('Updated', 'MasterRow'),
            '400': errorResponse('Validation error'),
            '403': errorResponse('Missing permission or read-only master'),
            '404': errorResponse('Row not found'),
          },
        },
        delete: {
          tags: ['Masters'],
          summary: 'Delete a master row',
          description: 'Requires permission `master:delete`.',
          operationId: 'deleteMasterData',
          security: bearer,
          parameters: [slugParam('slug'), uuidParam('id')],
          responses: {
            '200': jsonResponse('Deleted', 'Ok'),
            '403': errorResponse('Missing permission or read-only master'),
            '404': errorResponse('Row not found'),
          },
        },
      },
    },
  };
}
