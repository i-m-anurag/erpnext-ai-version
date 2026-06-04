import argon2 from 'argon2';

/** Password hashing with Argon2id (memory-hard, the OWASP-recommended default). */
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}

export const passwordService = new PasswordService();
