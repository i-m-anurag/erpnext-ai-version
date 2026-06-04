/** Server-side session record, stored in Redis (§5.8). */
export interface SessionData {
  userId: string;
  /** jti of the currently-valid refresh token for this session (rotation). */
  currentRefreshJti: string;
  /** Effective permission snapshot — populated by the permission module (Step 6). */
  permissions: string[];
  /** Active branch context (org module, later phase). */
  branchId: string | null;
  /** epoch ms when the session was created (drives absolute timeout). */
  createdAt: number;
  /** epoch ms hard expiry regardless of activity. */
  absoluteExpiresAt: number;
  lastSeenAt: number;
  ip?: string;
  device?: string;
}

/** Authenticated request context attached by requireAuth. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  session: SessionData;
}

export interface AccessTokenPayload {
  sub: string; // userId
  sid: string; // sessionId
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
  type: 'refresh';
}

/** Public-safe user shape returned to clients. */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  status: string;
  isFirstLogin: boolean;
}
