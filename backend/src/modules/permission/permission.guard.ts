import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js';

/**
 * Gate 2 of the ACL (§5.4): does the authenticated user's effective permission
 * set grant `module:action`? Reads the snapshot attached to the session by
 * requireAuth — no DB hit. Mount AFTER requireAuth.
 *
 * (Gate 1, module enablement, is enforced by only mounting a module's routes
 * when its feature flag is on — see routes.ts.)
 */
export function requirePermission(module: string, action: string): RequestHandler {
  const key = `${module}:${action}`;
  return (req, _res, next) => {
    if (!req.auth) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!req.auth.session.permissions.includes(key)) {
      next(new ForbiddenError(`Missing permission: ${key}`));
      return;
    }
    next();
  };
}
