import { inject } from '@angular/core';
import { HttpContextToken, type HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';
import { LoaderService } from './loader.service';

/** Set on a request (`context: new HttpContext().set(SKIP_LOADER, true)`) to keep
 *  it off the global loader (e.g. background polling). */
export const SKIP_LOADER = new HttpContextToken<boolean>(() => false);

/** Counts in-flight /api requests so the global loader bar can show progress. */
export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  const tracked = req.url.startsWith('/api') && !req.context.get(SKIP_LOADER);
  if (!tracked) return next(req);

  const loader = inject(LoaderService);
  loader.show();
  return next(req).pipe(finalize(() => loader.hide()));
};
