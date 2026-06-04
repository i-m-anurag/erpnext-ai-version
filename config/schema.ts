import { z } from 'zod';

/**
 * Schema for config/config.<env>.json — the single human-edited source of truth.
 *
 * These JSON files hold ALL configuration for a deployment, including secrets
 * (per project decision). The real files are git-ignored; only *.example.json
 * templates are committed. `scripts/gen-env.ts` validates a file against this
 * schema and flattens it into backend/.env.
 *
 * To add a new setting: add it here, add it to the *.example.json, and map it
 * in scripts/gen-env.ts (FLATTEN). The backend reads it back via its own env
 * schema (backend/src/config/env.ts).
 */
export const ConfigSchema = z.object({
  app: z.object({
    name: z.string().min(1),
    env: z.enum(['development', 'test', 'staging', 'production']),
    port: z.number().int().positive(),
    logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    /** Public base URL of the API, used in emails (set-password links, etc.). */
    publicUrl: z.string().url(),
  }),

  database: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    user: z.string().min(1),
    password: z.string(),
    name: z.string().min(1),
    ssl: z.boolean().default(false),
  }),

  redis: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    password: z.string().default(''),
    db: z.number().int().min(0).default(0),
  }),

  auth: z.object({
    accessTokenSecret: z.string().min(16),
    /** seconds */
    accessTokenTtl: z.number().int().positive().default(900),
    refreshTokenSecret: z.string().min(16),
    /** seconds */
    refreshTokenTtl: z.number().int().positive().default(60 * 60 * 24 * 30),
    /** seconds — single-use set/reset password link lifetime */
    passwordResetTtl: z.number().int().positive().default(60 * 60 * 24),
    /** seconds — session sliding idle window */
    sessionIdleTimeout: z.number().int().positive().default(60 * 30),
    /** seconds — absolute max session lifetime regardless of activity */
    sessionAbsoluteTimeout: z.number().int().positive().default(60 * 60 * 12),
    cookieDomain: z.string().default('localhost'),
    cookieSecure: z.boolean().default(false),
    /** allow multiple concurrent sessions per user, or force single active session */
    concurrentSessions: z.boolean().default(true),
  }),

  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    user: z.string().default(''),
    password: z.string().default(''),
    secure: z.boolean().default(false),
    from: z.string().min(1),
  }),

  /**
   * This deployment's client. When set, the seeder applies client-specific
   * overrides from seed-data/clients/<clientSlug>/ on top of the shipped base.
   */
  clientSlug: z.string().optional(),

  /** First-admin bootstrap — seeded on deploy, receives a welcome/set-password email. */
  admin: z.object({
    username: z.string().min(1),
    email: z.string().email(),
    displayName: z.string().default('Administrator'),
  }),

  /** Layer-1 config: which modules this deployment runs (feature toggles). */
  modules: z.record(z.string(), z.boolean()),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
