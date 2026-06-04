import { BaseRepository } from '../../shared/base.repository.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { UnauthorizedError, BadRequestError, NotFoundError } from '../../shared/errors.js';
import { User } from './user.entity.js';
import { tokenService } from './token.service.js';
import { passwordService } from './password.service.js';
import { sessionService } from './session.service.js';
import { resetTokenService } from './reset-token.service.js';
import { resolvePermissions } from './permission-provider.js';
import { emailService } from '../communication/index.js';
import type { LoginInput, SetPasswordInput } from './auth.schemas.js';
import type { PublicUser, SessionData } from './auth.types.js';

export interface RequestMeta {
  ip?: string;
  device?: string;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  user: PublicUser;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    status: u.status,
    isFirstLogin: u.isFirstLogin,
  };
}

export class AuthService {
  private readonly users = new BaseRepository(User);

  /** Username/password login → new session + access/refresh tokens. */
  async login(input: LoginInput, meta: RequestMeta): Promise<LoginResult> {
    const user = await this.users.findOne({ username: input.username.toLowerCase() });

    // Uniform failure regardless of which check fails (no user enumeration).
    if (!user || !user.passwordHash || user.status !== 'active') {
      // Still verify against a dummy hash to keep timing constant-ish.
      await passwordService.verify('$argon2id$v=19$m=65536,t=3,p=4$invalidsaltvalue$0', input.password);
      throw new UnauthorizedError('Invalid credentials');
    }

    const ok = await passwordService.verify(user.passwordHash, input.password);
    if (!ok) throw new UnauthorizedError('Invalid credentials');

    const tokens = await this.startSession(user, meta);
    user.lastLoginAt = new Date();
    await this.users.save(user);

    return { ...tokens, user: toPublicUser(user) };
  }

  /** Rotate the refresh token. Detects reuse of a superseded token → revoke session. */
  async refresh(rawRefreshToken: string): Promise<RefreshResult> {
    const payload = tokenService.verifyRefreshToken(rawRefreshToken);
    const session = await sessionService.get(payload.sid);
    if (!session) throw new UnauthorizedError('Session expired');

    // Reuse detection: a presented jti that isn't the current one means an old
    // (already-rotated) refresh token was replayed → treat as compromise.
    if (payload.jti !== session.currentRefreshJti) {
      await sessionService.revoke(payload.sid);
      logger.warn({ sessionId: payload.sid, userId: session.userId }, 'refresh token reuse detected — session revoked');
      throw new UnauthorizedError('Refresh token reuse detected');
    }

    const newJti = tokenService.newJti();
    session.currentRefreshJti = newJti;
    await sessionService.update(payload.sid, session);

    return {
      accessToken: tokenService.signAccessToken(session.userId, payload.sid),
      refreshToken: tokenService.signRefreshToken(session.userId, payload.sid, newJti),
      accessTokenExpiresIn: this.accessTtl(),
    };
  }

  async logout(sessionId: string): Promise<void> {
    await sessionService.revoke(sessionId);
  }

  /** Always succeeds publicly (no email enumeration); emails a token if user exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findOne({ email: email.toLowerCase() });
    if (!user || user.status !== 'active') {
      logger.info({ email }, 'forgot-password requested for unknown/inactive email — no-op');
      return;
    }
    const raw = await resetTokenService.issue(user.id, 'reset');
    await emailService.send('password-reset', user.email, this.passwordEmailVars(user, raw));
  }

  /** Consume a welcome/reset token and set the password; revoke existing sessions. */
  async setPassword(input: SetPasswordInput): Promise<void> {
    const token = await resetTokenService.validate(input.token);
    if (!token) throw new BadRequestError('Invalid or expired token');

    const passwordHash = await passwordService.hash(input.newPassword);

    await resetTokenService.transaction(async (manager) => {
      const userRepo = this.users.withManager(manager);
      const user = await userRepo.findById(token.userId);
      if (!user) throw new NotFoundError('User not found');

      user.passwordHash = passwordHash;
      user.isFirstLogin = false;
      user.mustChangePassword = false;
      await userRepo.save(user);

      await resetTokenService.consume(token.id, manager);
    });

    // Force re-login everywhere after a credential change (§5.8).
    await sessionService.revokeAllForUser(token.userId);
  }

  /** Issue a welcome (set-password) email for a seeded/new user. */
  async sendWelcome(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    const raw = await resetTokenService.issue(user.id, 'welcome');
    await emailService.send('welcome', user.email, this.passwordEmailVars(user, raw));
  }

  /** Variables shared by the welcome and password-reset templates. */
  private passwordEmailVars(user: User, rawToken: string): Record<string, string | number> {
    return {
      appName: env.app.name,
      userName: user.displayName ?? user.username,
      link: `${env.app.publicUrl}/set-password?token=${rawToken}`,
      expiryHours: Math.round(env.auth.passwordResetTtl / 3600),
    };
  }

  async getPublicUser(userId: string): Promise<PublicUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundError('User not found');
    return toPublicUser(user);
  }

  private accessTtl(): number {
    return env.auth.accessTokenTtl;
  }

  private async startSession(user: User, meta: RequestMeta): Promise<RefreshResult> {
    const jti = tokenService.newJti();
    // Effective permission snapshot, resolved via the permission module (or [] if
    // that module is disabled). Cached so we don't hit the DB on every request.
    const permissions = await resolvePermissions(user.id);
    const { sessionId } = await sessionService.create({
      userId: user.id,
      currentRefreshJti: jti,
      permissions,
      ip: meta.ip,
      device: meta.device,
    });
    return {
      accessToken: tokenService.signAccessToken(user.id, sessionId),
      refreshToken: tokenService.signRefreshToken(user.id, sessionId, jti),
      accessTokenExpiresIn: this.accessTtl(),
    };
  }
}

export const authService = new AuthService();
export type { SessionData };
