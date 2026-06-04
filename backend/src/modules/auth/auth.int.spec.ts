import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppDataSource } from '../../db/data-source.js';
import { connectRedis, redis } from '../../db/redis.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { registerAllResourceTypes } from '../../db/seeds/register-resources.js';
import { emailTemplatesSeeder } from '../../db/seeds/seeders/email-templates.seeder.js';
import { User } from './user.entity.js';
import { authService } from './auth.service.js';
import { sessionService } from './session.service.js';
import { tokenService } from './token.service.js';
import { resetTokenService } from './reset-token.service.js';
import { UnauthorizedError } from '../../shared/errors.js';

const USERNAME = '__it_auth_user';
const EMAIL = '__it_auth_user@erp.local';
const PASSWORD = 'Sup3rSecret!';
const MAILHOG = 'http://localhost:8025';

async function clearMail(): Promise<void> {
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined);
}
async function mailBodies(expectedCount = 1): Promise<string[]> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${MAILHOG}/api/v2/messages`);
    const body = (await res.json()) as { items: { Content: { Body: string } }[] };
    if (body.items.length >= expectedCount) return body.items.map((it) => it.Content.Body);
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

describe('auth lifecycle (integration)', () => {
  const users = new BaseRepository(User);
  let userId: string;
  let session1: { accessToken: string; refreshToken: string };
  let rotatedRefresh: string;
  let sid: string;

  beforeAll(async () => {
    registerAllResourceTypes();
    await AppDataSource.initialize();
    await connectRedis();
    await emailTemplatesSeeder.run();

    const prior = await users.findOne({ username: USERNAME });
    if (prior) {
      await sessionService.revokeAllForUser(prior.id);
      await users.delete(prior.id);
    }
    await clearMail();
    const user = await users.save(
      users.create({ username: USERNAME, email: EMAIL, displayName: 'IT User', isFirstLogin: true }),
    );
    userId = user.id;
  });

  afterAll(async () => {
    await sessionService.revokeAllForUser(userId);
    await users.delete(userId);
    await clearMail();
    await AppDataSource.destroy();
    await redis.quit();
  });

  it('sends a DB-rendered welcome email', async () => {
    await authService.sendWelcome(userId);
    const bodies = await mailBodies(1);
    expect(bodies.some((b) => /set your password/i.test(b))).toBe(true);
  });

  it('sets the password via a single-use token (and rejects reuse)', async () => {
    const raw = await resetTokenService.issue(userId, 'welcome');
    await authService.setPassword({ token: raw, newPassword: PASSWORD });
    const after = await users.findById(userId);
    expect(after?.passwordHash).toBeTruthy();
    expect(after?.isFirstLogin).toBe(false);
    await expect(authService.setPassword({ token: raw, newPassword: PASSWORD })).rejects.toThrow(/Invalid or expired/);
  });

  it('rejects a bad password and logs in with the correct one', async () => {
    await expect(authService.login({ username: USERNAME, password: 'wrong' }, {})).rejects.toBeInstanceOf(UnauthorizedError);
    session1 = await authService.login({ username: USERNAME, password: PASSWORD }, { ip: '127.0.0.1' });
    expect(session1.accessToken).toBeTruthy();
    sid = tokenService.verifyAccessToken(session1.accessToken).sid;
    expect(await sessionService.get(sid)).toBeTruthy();
  });

  it('rotates the refresh token', async () => {
    const refreshed = await authService.refresh(session1.refreshToken);
    rotatedRefresh = refreshed.refreshToken;
    expect(rotatedRefresh).not.toBe(session1.refreshToken);
  });

  it('detects refresh-token reuse and revokes the session', async () => {
    await expect(authService.refresh(session1.refreshToken)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(await sessionService.get(sid)).toBeNull();
    await expect(authService.refresh(rotatedRefresh)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('forgot-password emails only the real address; logout revokes the session', async () => {
    await clearMail();
    await authService.forgotPassword(EMAIL);
    await authService.forgotPassword('nobody@erp.local');
    const bodies = await mailBodies(1);
    expect(bodies.length).toBe(1);
    expect(/reset your password/i.test(bodies[0] ?? '')).toBe(true);

    const s2 = await authService.login({ username: USERNAME, password: PASSWORD }, {});
    const sid2 = tokenService.verifyAccessToken(s2.accessToken).sid;
    await authService.logout(sid2);
    expect(await sessionService.get(sid2)).toBeNull();
  });
});
