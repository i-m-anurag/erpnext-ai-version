import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../../shared/async-handler.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { requireAuth } from './auth.middleware.js';
import { authController } from './auth.controller.js';
import { loginSchema, forgotPasswordSchema, setPasswordSchema } from './auth.schemas.js';

/** Tight limiter on credential endpoints to blunt brute-force/abuse (§7). */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' } },
});

export function buildAuthRouter(): Router {
  const router = Router();

  router.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(authController.login));
  router.post('/refresh', asyncHandler(authController.refresh));
  router.post('/logout', requireAuth, asyncHandler(authController.logout));
  router.post(
    '/forgot-password',
    authLimiter,
    validateBody(forgotPasswordSchema),
    asyncHandler(authController.forgotPassword),
  );
  router.post('/set-password', authLimiter, validateBody(setPasswordSchema), asyncHandler(authController.setPassword));
  router.get('/me', requireAuth, asyncHandler(authController.me));

  return router;
}
