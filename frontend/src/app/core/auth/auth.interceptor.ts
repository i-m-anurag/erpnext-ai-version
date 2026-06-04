import { inject } from '@angular/core';
import { type HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthStore } from '../state/auth.store';
import { AuthService } from './auth.service';

/** Endpoints that must NOT receive a bearer token or trigger refresh-on-401. */
const BYPASS = ['/api/auth/login', '/api/auth/refresh', '/api/public/'];

/**
 * For every /api request: send credentials (so the refresh cookie flows) and
 * attach the in-memory access token. On 401, transparently refresh once (deduped)
 * and retry the original request; if refresh fails, propagate the error.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) return next(req);

  const store = inject(AuthStore);
  const auth = inject(AuthService);
  const bypass = BYPASS.some((p) => req.url.includes(p));

  let r = req.clone({ withCredentials: true });
  const token = store.accessToken();
  if (token && !bypass) {
    r = r.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(r).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || bypass) return throwError(() => err);
      return auth.refreshToken().pipe(
        switchMap((newToken) => {
          if (!newToken) return throwError(() => err);
          const retried = req.clone({
            withCredentials: true,
            setHeaders: { Authorization: `Bearer ${newToken}` },
          });
          return next(retried);
        }),
      );
    }),
  );
};
