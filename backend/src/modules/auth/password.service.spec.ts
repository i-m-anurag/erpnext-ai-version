import { describe, it, expect } from 'vitest';
import { passwordService } from './password.service.js';

describe('passwordService', () => {
  it('hashes a password to an argon2id string and verifies it', async () => {
    const hash = await passwordService.hash('Sup3rSecret!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await passwordService.verify(hash, 'Sup3rSecret!')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await passwordService.hash('Sup3rSecret!');
    expect(await passwordService.verify(hash, 'wrong')).toBe(false);
  });

  it('returns false (not throw) on a malformed hash', async () => {
    expect(await passwordService.verify('not-a-hash', 'x')).toBe(false);
  });
});
