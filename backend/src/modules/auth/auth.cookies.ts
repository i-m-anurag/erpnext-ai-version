import type { Response } from 'express';
import { env } from '../../config/env.js';

/**
 * The refresh token lives ONLY in an httpOnly, Secure, SameSite cookie scoped to
 * the refresh endpoint — not readable by JS, so XSS can't steal it (§5.2). The
 * access token, by contrast, is returned in the response body for the SPA to
 * hold in memory.
 */
export const REFRESH_COOKIE_NAME = 'erp_rt';
const REFRESH_COOKIE_PATH = '/api/auth';

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.auth.cookieSecure,
    sameSite: 'lax',
    domain: env.auth.cookieDomain,
    path: REFRESH_COOKIE_PATH,
    maxAge: env.auth.refreshTokenTtl * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.auth.cookieSecure,
    sameSite: 'lax',
    domain: env.auth.cookieDomain,
    path: REFRESH_COOKIE_PATH,
  });
}
