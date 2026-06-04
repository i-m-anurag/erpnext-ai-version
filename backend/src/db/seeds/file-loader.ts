import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** backend/src/db/seeds (or backend/dist/db/seeds) → backend/seed-data */
const SEED_ROOT = resolve(__dirname, '../../../seed-data');

export interface SeedFile {
  /** filename, e.g. "vendor-onboarding.json" */
  file: string;
  /** parsed JSON, validated by the caller's schema */
  raw: unknown;
}

function readJsonDir(dir: string): SeedFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({ file, raw: JSON.parse(readFileSync(join(dir, file), 'utf8')) as unknown }));
}

/** Shipped base files for a resource kind, e.g. baseFiles('forms'). */
export function baseFiles(...segments: string[]): SeedFile[] {
  return readJsonDir(join(SEED_ROOT, 'base', ...segments));
}

/** Active-client override files (empty unless config.clientSlug is set). */
export function clientFiles(...segments: string[]): SeedFile[] {
  if (!env.clientSlug) return [];
  return readJsonDir(join(SEED_ROOT, 'clients', env.clientSlug, ...segments));
}
