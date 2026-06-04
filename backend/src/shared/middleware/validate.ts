import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/**
 * Validate and coerce `req.body` against a Zod schema. On failure the ZodError
 * is forwarded to the central error handler (→ 400 VALIDATION_ERROR). On success
 * `req.body` is replaced with the parsed (typed, defaulted) value.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}
