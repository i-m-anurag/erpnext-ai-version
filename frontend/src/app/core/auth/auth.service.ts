import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  catchError,
  finalize,
  firstValueFrom,
  forkJoin,
  map,
  type Observable,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AuthStore } from '../state/auth.store';
import type { LoginResponse, MeResponse, MetaResponse, RefreshResponse } from '../models/api.models';

/**
 * Auth flows against the backend (all relative `/api`, proxied to the same
 * origin). The access token lives in memory (AuthStore); the refresh token is an
 * httpOnly cookie the browser sends automatically (interceptor adds withCredentials).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);

  /** Shared in-flight refresh so concurrent 401s collapse into one refresh call. */
  private refreshing$: Observable<string | null> | null = null;

  login(username: string, password: string): Observable<void> {
    this.store.setStatus('authenticating');
    return this.http.post<LoginResponse>('/api/auth/login', { username, password }).pipe(
      switchMap((res) => this.loadProfile(res.accessToken)),
      catchError((err) => {
        this.store.setAnonymous();
        return throwError(() => err);
      }),
    );
  }

  logout(): Observable<void> {
    return this.http.post('/api/auth/logout', {}).pipe(
      catchError(() => of(null)),
      tap(() => this.store.setAnonymous()),
      map(() => undefined),
    );
  }

  /** Rotate the access token via the refresh cookie. Deduped across callers. */
  refreshToken(): Observable<string | null> {
    if (!this.refreshing$) {
      this.refreshing$ = this.http.post<RefreshResponse>('/api/auth/refresh', {}).pipe(
        map((r) => {
          this.store.setToken(r.accessToken);
          return r.accessToken as string | null;
        }),
        catchError(() => {
          this.store.setAnonymous();
          return of(null);
        }),
        finalize(() => {
          this.refreshing$ = null;
        }),
        shareReplay(1),
      );
    }
    return this.refreshing$;
  }

  /** Attempt a silent session restore on app load (refresh cookie persists reloads). */
  restoreSession(): Promise<void> {
    return firstValueFrom(
      this.refreshToken().pipe(
        switchMap((token) => (token ? this.loadProfile(token) : of(undefined))),
        catchError(() => of(undefined)),
        map(() => undefined),
      ),
    );
  }

  /** Load /me (user + permissions) and /meta (modules) and set the session. */
  private loadProfile(accessToken: string): Observable<void> {
    this.store.setToken(accessToken);
    return forkJoin({
      me: this.http.get<MeResponse>('/api/auth/me'),
      meta: this.http.get<MetaResponse>('/api/meta'),
    }).pipe(
      map(({ me, meta }) => {
        this.store.setSession({
          accessToken,
          user: me.user,
          permissions: me.permissions,
          branchId: me.branchId,
          modules: meta.modules,
        });
      }),
    );
  }
}
