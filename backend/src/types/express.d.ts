import type { AuthContext } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth on authenticated routes. */
      auth?: AuthContext;
    }
  }
}

export {};
