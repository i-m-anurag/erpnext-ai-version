import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../state/auth.store';

/** Require an authenticated session, else redirect to /login. */
export const authGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  return store.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

/**
 * Require the permission(s) declared in route `data.permission` (string or
 * string[], any-of). Unauthenticated → /login; authenticated but lacking the
 * permission → bounced to /app. The backend remains the real boundary.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (!store.isAuthenticated()) return router.createUrlTree(['/login']);

  const required = route.data?.['permission'] as string | string[] | undefined;
  if (!required) return true;
  const keys = Array.isArray(required) ? required : [required];
  return store.hasAnyPermission(keys) ? true : router.createUrlTree(['/app']);
};
