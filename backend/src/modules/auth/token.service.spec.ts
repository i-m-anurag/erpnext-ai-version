import { describe, it, expect } from 'vitest';
import { tokenService } from './token.service.js';
import { UnauthorizedError } from '../../shared/errors.js';

describe('tokenService', () => {
  it('signs and verifies an access token (round-trip)', () => {
    const token = tokenService.signAccessToken('user-1', 'sess-1');
    const payload = tokenService.verifyAccessToken(token);
    expect(payload.sub).toBe('user-1');
    expect(payload.sid).toBe('sess-1');
    expect(payload.type).toBe('access');
  });

  it('signs and verifies a refresh token carrying a jti', () => {
    const jti = tokenService.newJti();
    const token = tokenService.signRefreshToken('user-1', 'sess-1', jti);
    const payload = tokenService.verifyRefreshToken(token);
    expect(payload.jti).toBe(jti);
    expect(payload.type).toBe('refresh');
  });

  it('rejects a garbage token', () => {
    expect(() => tokenService.verifyAccessToken('not-a-jwt')).toThrow(UnauthorizedError);
  });

  it('does not accept an access token as a refresh token (separate secrets)', () => {
    const access = tokenService.signAccessToken('user-1', 'sess-1');
    expect(() => tokenService.verifyRefreshToken(access)).toThrow(UnauthorizedError);
  });
});
