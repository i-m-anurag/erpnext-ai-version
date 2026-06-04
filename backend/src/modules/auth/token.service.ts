import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { UnauthorizedError } from '../../shared/errors.js';
import type { AccessTokenPayload, RefreshTokenPayload } from './auth.types.js';

/**
 * Signs and verifies the two token types (§5.2):
 *   - access:  short-lived JWT, sent in the Authorization header, held in SPA memory
 *   - refresh: long-lived JWT, sent only in the httpOnly cookie, carries a jti so
 *              the session can detect rotation/reuse
 * The two use SEPARATE secrets so an access token can never be replayed as a refresh.
 */
export class TokenService {
  signAccessToken(userId: string, sessionId: string): string {
    const payload: AccessTokenPayload = { sub: userId, sid: sessionId, type: 'access' };
    return jwt.sign(payload, env.auth.accessTokenSecret, { expiresIn: env.auth.accessTokenTtl });
  }

  signRefreshToken(userId: string, sessionId: string, jti: string): string {
    const payload: RefreshTokenPayload = { sub: userId, sid: sessionId, jti, type: 'refresh' };
    return jwt.sign(payload, env.auth.refreshTokenSecret, { expiresIn: env.auth.refreshTokenTtl });
  }

  newJti(): string {
    return randomUUID();
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const decoded = jwt.verify(token, env.auth.accessTokenSecret) as AccessTokenPayload;
      if (decoded.type !== 'access') throw new Error('wrong token type');
      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    try {
      const decoded = jwt.verify(token, env.auth.refreshTokenSecret) as RefreshTokenPayload;
      if (decoded.type !== 'refresh') throw new Error('wrong token type');
      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}

export const tokenService = new TokenService();
