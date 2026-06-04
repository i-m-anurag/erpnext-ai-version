import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { asyncHandler } from '../../shared/async-handler.js';
import { formService } from './form.service.js';

/**
 * UNAUTHENTICATED form access — serves ONLY forms flagged `public: true` (e.g. the
 * login form). Everything else returns 404 (no existence leak). Rate-limited to
 * blunt enumeration/abuse. This is the only pre-auth surface for form definitions;
 * private forms are reachable solely via the authed GET /api/forms/:slug.
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, try again later' } },
});

export function buildPublicFormRouter(): Router {
  const router = Router();
  router.get(
    '/:slug',
    publicLimiter,
    asyncHandler(async (req: Request, res: Response) => {
      const eff = await formService.getPublicForm(String(req.params.slug));
      res.json({ slug: eff.slug, version: eff.version, form: eff.definition });
    }),
  );
  return router;
}
