/**
 * SSO + MFA seam (designed, not implemented this phase).
 *
 * Per §5.2 the auth module will support SAML/OAuth against the deployment's
 * configured IdP, plus an optional MFA step. The integration points are:
 *
 *  - IdP config (metadata, signing cert) is read from this instance's config —
 *    a known, configured signing cert is the production-reliable approach vs.
 *    parsing metadata at runtime.
 *  - An SSO callback controller validates the assertion, resolves/creates the
 *    local User, then calls the SAME session-creation path used by password
 *    login (sessionService.create + token issue) — so downstream code is
 *    identical regardless of how the user authenticated.
 *  - MFA, when enabled, inserts a verification step between credential check and
 *    session creation, gated by a per-user/-deployment policy flag.
 *
 * Implementing these later requires no change to sessions, tokens, ACL, or the
 * requireAuth middleware — only new entry controllers that converge on
 * startSession(). This file documents that contract so the seam stays intact.
 */
export interface SsoProvider {
  readonly kind: 'saml' | 'oauth';
  /** Returns the local userId for a validated assertion (provision-on-first-login allowed). */
  resolveUser(assertion: unknown): Promise<string>;
}

export const SSO_ENABLED = false;
export const MFA_ENABLED = false;
