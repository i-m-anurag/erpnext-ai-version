import 'dotenv/config';
import { z } from 'zod';

/**
 * Validates process.env (populated from the generated backend/.env) into a typed
 * config object. The .env itself is produced by scripts/gen-env.ts from
 * config/config.<env>.json — never hand-edited.
 *
 * This schema mirrors the flattened keys emitted by the generator. If you add a
 * setting to config/schema.ts and the generator, add the matching key here.
 */
const bool = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .pipe(z.boolean());

const int = z.coerce.number().int();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('ERP'),
  APP_PORT: int.default(3000),
  APP_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  APP_PUBLIC_URL: z.string().url(),

  DB_HOST: z.string(),
  DB_PORT: int.default(5432),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),
  DB_SSL: bool.default(false),

  REDIS_HOST: z.string(),
  REDIS_PORT: int.default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_DB: int.default(0),

  AUTH_ACCESS_TOKEN_SECRET: z.string().min(16),
  AUTH_ACCESS_TOKEN_TTL: int.default(900),
  AUTH_REFRESH_TOKEN_SECRET: z.string().min(16),
  AUTH_REFRESH_TOKEN_TTL: int.default(2592000),
  AUTH_PASSWORD_RESET_TTL: int.default(86400),
  AUTH_SESSION_IDLE_TIMEOUT: int.default(1800),
  AUTH_SESSION_ABSOLUTE_TIMEOUT: int.default(43200),
  AUTH_COOKIE_DOMAIN: z.string().default('localhost'),
  AUTH_COOKIE_SECURE: bool.default(false),
  AUTH_CONCURRENT_SESSIONS: bool.default(true),

  SMTP_HOST: z.string(),
  SMTP_PORT: int.default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_SECURE: bool.default(false),
  SMTP_FROM: z.string(),

  ADMIN_USERNAME: z.string(),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_DISPLAY_NAME: z.string().default('Administrator'),

  CLIENT_SLUG: z.string().default(''),

  BRANDING_PRODUCT_NAME: z.string().default(''),
  BRANDING_LOGO_URL: z.string().default('/branding/logo.svg'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    '✗ Invalid/missing environment. Did you run `npm run gen:env -- <env>`?\n' +
      z.prettifyError(parsed.error),
  );
  process.exit(1);
}

const e = parsed.data;

/** Module enablement (Layer-1 config) read from MODULE_* vars. */
function readModules(): Record<string, boolean> {
  const mods: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('MODULE_')) {
      mods[k.slice('MODULE_'.length).toLowerCase()] = v === 'true' || v === '1';
    }
  }
  return mods;
}

export const env = {
  isProd: e.NODE_ENV === 'production',
  nodeEnv: e.NODE_ENV,
  app: {
    name: e.APP_NAME,
    port: e.APP_PORT,
    logLevel: e.APP_LOG_LEVEL,
    publicUrl: e.APP_PUBLIC_URL,
  },
  db: {
    host: e.DB_HOST,
    port: e.DB_PORT,
    user: e.DB_USER,
    password: e.DB_PASSWORD,
    name: e.DB_NAME,
    ssl: e.DB_SSL,
  },
  redis: {
    host: e.REDIS_HOST,
    port: e.REDIS_PORT,
    password: e.REDIS_PASSWORD || undefined,
    db: e.REDIS_DB,
  },
  auth: {
    accessTokenSecret: e.AUTH_ACCESS_TOKEN_SECRET,
    accessTokenTtl: e.AUTH_ACCESS_TOKEN_TTL,
    refreshTokenSecret: e.AUTH_REFRESH_TOKEN_SECRET,
    refreshTokenTtl: e.AUTH_REFRESH_TOKEN_TTL,
    passwordResetTtl: e.AUTH_PASSWORD_RESET_TTL,
    sessionIdleTimeout: e.AUTH_SESSION_IDLE_TIMEOUT,
    sessionAbsoluteTimeout: e.AUTH_SESSION_ABSOLUTE_TIMEOUT,
    cookieDomain: e.AUTH_COOKIE_DOMAIN,
    cookieSecure: e.AUTH_COOKIE_SECURE,
    concurrentSessions: e.AUTH_CONCURRENT_SESSIONS,
  },
  smtp: {
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    user: e.SMTP_USER || undefined,
    password: e.SMTP_PASSWORD || undefined,
    secure: e.SMTP_SECURE,
    from: e.SMTP_FROM,
  },
  admin: {
    username: e.ADMIN_USERNAME,
    email: e.ADMIN_EMAIL,
    displayName: e.ADMIN_DISPLAY_NAME,
  },
  /** Active client slug for this deployment (drives client-override seeding). */
  clientSlug: e.CLIENT_SLUG || undefined,
  /** White-label branding surfaced to the SPA via /api/meta. */
  branding: {
    productName: e.BRANDING_PRODUCT_NAME || e.APP_NAME,
    logoUrl: e.BRANDING_LOGO_URL,
  },
  modules: readModules(),
} as const;

export type Env = typeof env;

/** True if a module is enabled for this deployment (Layer-1 gate). */
export function isModuleEnabled(name: string): boolean {
  return env.modules[name.toLowerCase()] === true;
}
