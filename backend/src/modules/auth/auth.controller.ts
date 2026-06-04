import type { Request, Response } from 'express';
import { authService } from './auth.service.js';
import { UnauthorizedError } from '../../shared/errors.js';
import { REFRESH_COOKIE_NAME, setRefreshCookie, clearRefreshCookie } from './auth.cookies.js';
import type { ForgotPasswordInput, LoginInput, SetPasswordInput } from './auth.schemas.js';

function requestMeta(req: Request): { ip?: string; device?: string } {
  return { ip: req.ip, device: req.get('user-agent') ?? undefined };
}

export const authController = {
  async login(req: Request, res: Response): Promise<void> {
    const body = req.body as LoginInput;
    const result = await authService.login(body, requestMeta(req));
    setRefreshCookie(res, result.refreshToken);
    res.json({
      accessToken: result.accessToken,
      accessTokenExpiresIn: result.accessTokenExpiresIn,
      user: result.user,
    });
  },

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!token) throw new UnauthorizedError('Missing refresh token');
    const result = await authService.refresh(token);
    setRefreshCookie(res, result.refreshToken);
    res.json({ accessToken: result.accessToken, accessTokenExpiresIn: result.accessTokenExpiresIn });
  },

  async logout(req: Request, res: Response): Promise<void> {
    if (req.auth) await authService.logout(req.auth.sessionId);
    clearRefreshCookie(res);
    res.json({ ok: true });
  },

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const body = req.body as ForgotPasswordInput;
    await authService.forgotPassword(body.email);
    // Always 200 — never reveal whether the email exists.
    res.json({ ok: true });
  },

  async setPassword(req: Request, res: Response): Promise<void> {
    const body = req.body as SetPasswordInput;
    await authService.setPassword(body);
    res.json({ ok: true });
  },

  async me(req: Request, res: Response): Promise<void> {
    const { userId, session } = req.auth!;
    const user = await authService.getPublicUser(userId);
    res.json({ user, permissions: session.permissions, branchId: session.branchId });
  },
};
