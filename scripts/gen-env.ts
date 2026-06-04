#!/usr/bin/env tsx
/**
 * Config → .env generator.
 *
 * Reads config/config.<env>.json, validates it against config/schema.ts, and
 * writes the flattened result to backend/.env (and worker/.env). This is the
 * ONLY consumer of the JSON config; the backend never reads the JSON directly —
 * it reads the generated .env via backend/src/config/env.ts.
 *
 * Usage:
 *   npm run gen:env -- dev          # uses config/config.dev.json
 *   npm run gen:env -- production   # uses config/config.production.json
 *
 * Whenever a config value changes, edit the JSON and re-run this. Never hand-edit
 * the generated .env files.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ConfigSchema, type AppConfig } from '../config/schema.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const envName = process.argv[2];
if (!envName) {
  console.error('Usage: npm run gen:env -- <env>   (e.g. dev, staging, production)');
  process.exit(1);
}

const configPath = resolve(ROOT, `config/config.${envName}.json`);
const examplePath = resolve(ROOT, `config/config.${envName}.example.json`);

if (!existsSync(configPath)) {
  console.error(`\n✗ Missing ${configPath}`);
  if (existsSync(examplePath)) {
    console.error(`  Copy the template and fill in real values:`);
    console.error(`    cp config/config.${envName}.example.json config/config.${envName}.json\n`);
  }
  process.exit(1);
}

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (err) {
  console.error(`✗ ${configPath} is not valid JSON:`, (err as Error).message);
  process.exit(1);
}

const parsed = ConfigSchema.safeParse(raw);
if (!parsed.success) {
  console.error(`✗ ${configPath} failed validation:\n`);
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

const cfg = parsed.data;

/** Flatten validated config → flat env-var key/value pairs. */
function flatten(c: AppConfig): Record<string, string | number | boolean> {
  const env: Record<string, string | number | boolean> = {
    NODE_ENV: c.app.env,
    APP_NAME: c.app.name,
    APP_PORT: c.app.port,
    APP_LOG_LEVEL: c.app.logLevel,
    APP_PUBLIC_URL: c.app.publicUrl,

    DB_HOST: c.database.host,
    DB_PORT: c.database.port,
    DB_USER: c.database.user,
    DB_PASSWORD: c.database.password,
    DB_NAME: c.database.name,
    DB_SSL: c.database.ssl,

    REDIS_HOST: c.redis.host,
    REDIS_PORT: c.redis.port,
    REDIS_PASSWORD: c.redis.password,
    REDIS_DB: c.redis.db,

    AUTH_ACCESS_TOKEN_SECRET: c.auth.accessTokenSecret,
    AUTH_ACCESS_TOKEN_TTL: c.auth.accessTokenTtl,
    AUTH_REFRESH_TOKEN_SECRET: c.auth.refreshTokenSecret,
    AUTH_REFRESH_TOKEN_TTL: c.auth.refreshTokenTtl,
    AUTH_PASSWORD_RESET_TTL: c.auth.passwordResetTtl,
    AUTH_SESSION_IDLE_TIMEOUT: c.auth.sessionIdleTimeout,
    AUTH_SESSION_ABSOLUTE_TIMEOUT: c.auth.sessionAbsoluteTimeout,
    AUTH_COOKIE_DOMAIN: c.auth.cookieDomain,
    AUTH_COOKIE_SECURE: c.auth.cookieSecure,
    AUTH_CONCURRENT_SESSIONS: c.auth.concurrentSessions,

    SMTP_HOST: c.smtp.host,
    SMTP_PORT: c.smtp.port,
    SMTP_USER: c.smtp.user,
    SMTP_PASSWORD: c.smtp.password,
    SMTP_SECURE: c.smtp.secure,
    SMTP_FROM: c.smtp.from,

    ADMIN_USERNAME: c.admin.username,
    ADMIN_EMAIL: c.admin.email,
    ADMIN_DISPLAY_NAME: c.admin.displayName,

    CLIENT_SLUG: c.clientSlug ?? '',
  };

  // Module toggles → MODULE_<NAME>=true|false
  for (const [name, enabled] of Object.entries(c.modules)) {
    env[`MODULE_${name.toUpperCase()}`] = enabled;
  }

  return env;
}

function serialize(env: Record<string, string | number | boolean>): string {
  const header =
    `# GENERATED FILE — do not edit by hand.\n` +
    `# Source: config/config.${envName}.json  →  scripts/gen-env.ts\n` +
    `# Regenerate with: npm run gen:env -- ${envName}\n\n`;
  const lines = Object.entries(env).map(([k, v]) => {
    const value = String(v);
    // Quote values containing whitespace or special chars.
    const needsQuote = /[\s#"'$]/.test(value);
    return `${k}=${needsQuote ? JSON.stringify(value) : value}`;
  });
  return header + lines.join('\n') + '\n';
}

const flat = flatten(cfg);
const contents = serialize(flat);

const targets = [resolve(ROOT, 'backend/.env'), resolve(ROOT, 'worker/.env')];
for (const target of targets) {
  if (existsSync(dirname(target))) {
    writeFileSync(target, contents, 'utf8');
    console.log(`✓ wrote ${target.replace(ROOT + '/', '')}  (${Object.keys(flat).length} vars)`);
  }
}

console.log(`✓ generated env for "${envName}" from config/config.${envName}.json`);
