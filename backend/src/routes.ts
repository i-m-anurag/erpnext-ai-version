import type { Express, Request, Response } from 'express';
import { AppDataSource } from './db/data-source.js';
import { redis } from './db/redis.js';
import { env, isModuleEnabled } from './config/env.js';
import { buildAuthRouter } from './modules/auth/index.js';
import { setPermissionResolver } from './modules/auth/permission-provider.js';
import { buildPermissionRouter, permissionService } from './modules/permission/index.js';
import { buildFormRouter, buildPublicFormRouter } from './modules/form/index.js';
import { buildMasterRouter } from './modules/master/index.js';
import { buildActivityRouter } from './modules/activity/index.js';
import { buildWorkflowRouter, buildWorkflowAdminRouter } from './modules/workflow/index.js';
import { buildTemplateRouter } from './modules/communication/index.js';
import { buildDocumentRouter } from './modules/document/index.js';
import { buildNamingRouter } from './modules/naming/index.js';
import { buildAccountRouter } from './modules/accounts/index.js';

/**
 * Central route registration. As modules land (auth, permission, ...), each
 * exposes a router that is mounted here, gated by its module-enablement flag.
 */
export function registerRoutes(app: Express): void {
  // Liveness — process is up.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Readiness — dependencies reachable.
  app.get('/readyz', async (_req: Request, res: Response) => {
    const checks: Record<string, 'ok' | 'down'> = { db: 'down', redis: 'down' };
    try {
      await AppDataSource.query('SELECT 1');
      checks.db = 'ok';
    } catch {
      /* leave as down */
    }
    try {
      const pong = await redis.ping();
      if (pong === 'PONG') checks.redis = 'ok';
    } catch {
      /* leave as down */
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ready' : 'degraded', checks });
  });

  // Surfaces which modules this deployment runs (Layer-1 config). Under /api so
  // the SPA reaches it through the same-origin proxy (health probes stay at root).
  app.get('/api/meta', (_req: Request, res: Response) => {
    res.json({ name: env.app.name, env: env.nodeEnv, modules: env.modules, branding: env.branding });
  });

  // Module routers — each gated by its Layer-1 enablement flag.
  if (isModuleEnabled('permission')) {
    // Let auth resolve effective permissions for the session snapshot.
    setPermissionResolver((userId) => permissionService.computeEffectivePermissions(userId));
    app.use('/api/permissions', buildPermissionRouter());
  }

  if (isModuleEnabled('auth')) {
    app.use('/api/auth', buildAuthRouter());
  }

  if (isModuleEnabled('form')) {
    // Public (unauthenticated) form access — serves only `public: true` forms.
    app.use('/api/public/forms', buildPublicFormRouter());
    app.use('/api/forms', buildFormRouter());
  }

  if (isModuleEnabled('master')) {
    app.use('/api/masters', buildMasterRouter());
  }

  // Activity (timeline + comments) for any record. Gated by auth + activity:* perms.
  app.use('/api/activity', buildActivityRouter());

  // Workflow (state machine) for master records. Gated by auth + workflow:* perms.
  app.use('/api/workflow', buildWorkflowRouter());
  // Workflow definition management (the configurator).
  app.use('/api/workflow-defs', buildWorkflowAdminRouter());

  // Communication — email-template management. Gated by auth + communication:* perms.
  app.use('/api/templates', buildTemplateRouter());

  // Document chaining (lineage + create-next). Gated by auth + master:* perms.
  app.use('/api/documents', buildDocumentRouter());

  // Naming-series (auto-id) management. Gated by auth + config:* perms.
  app.use('/api/naming-series', buildNamingRouter());

  // Chart of Accounts (read-only; seeded). Gated by auth.
  app.use('/api/accounts', buildAccountRouter());
}
