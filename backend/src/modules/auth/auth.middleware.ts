import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../../shared/errors.js';
import { tokenService } from './token.service.js';
import { sessionService } from './session.service.js';

/**
 * Authenticate a request: verify the access token, load the server-side session
 * (so revocation is immediate), slide the idle window, and attach req.auth. The
 * session carries the permission snapshot the ACL layer (Step 6) will read,
 * avoiding a DB hit per request (§5.8).
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  void (async () => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing bearer token');
    }
    const payload = tokenService.verifyAccessToken(header.slice('Bearer '.length));

    const session = await sessionService.get(payload.sid);
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedError('Session expired or revoked');
    }

    await sessionService.touch(payload.sid, session);
    req.auth = { userId: payload.sub, sessionId: payload.sid, session };
    next();
  })().catch(next);
};
