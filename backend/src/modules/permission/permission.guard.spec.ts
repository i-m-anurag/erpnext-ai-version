import { describe, it, expect } from 'vitest';
import type { Request, Response } from 'express';
import { requirePermission } from './permission.guard.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors.js';

/** Run the guard synchronously and return any error passed to next(). */
function run(permissions: string[] | null, module: string, action: string): unknown {
  const req = (permissions === null ? {} : { auth: { session: { permissions } } }) as unknown as Request;
  let captured: unknown;
  requirePermission(module, action)(req, {} as Response, (err?: unknown) => {
    captured = err;
  });
  return captured;
}

describe('requirePermission', () => {
  it('passes (no error) when the permission is present', () => {
    expect(run(['master:view'], 'master', 'view')).toBeUndefined();
  });

  it('forwards ForbiddenError when the permission is missing', () => {
    expect(run(['master:view'], 'master', 'create')).toBeInstanceOf(ForbiddenError);
  });

  it('forwards UnauthorizedError when there is no auth context', () => {
    expect(run(null, 'master', 'view')).toBeInstanceOf(UnauthorizedError);
  });
});
