/**
 * Auth module public API (§5.2 / §5.8). Local auth is complete: password login,
 * rotating refresh tokens with reuse detection, Redis-backed sessions, welcome /
 * forgot / set-password flows. SSO (SAML/OAuth) and MFA are designed as future
 * hooks — see sso.placeholder.ts — but not implemented in this phase.
 */
export { buildAuthRouter } from './auth.routes.js';
export { requireAuth } from './auth.middleware.js';
export { authService } from './auth.service.js';
export { sessionService } from './session.service.js';
export { User } from './user.entity.js';
export { PasswordResetToken } from './password-reset-token.entity.js';
export type { AuthContext, SessionData, PublicUser } from './auth.types.js';
