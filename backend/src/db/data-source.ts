import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { env } from '../config/env.js';
import { entities } from './entities.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Single shared TypeORM DataSource.
 *
 * Schema is migration-driven: `synchronize` is ALWAYS false. Entities are listed
 * explicitly (src/db/entities.ts) so metadata registers consistently under tsx,
 * compiled JS, and the Vitest/SWC transform. Migrations are still discovered by
 * glob (used only by the CLI under tsx, and compiled JS in prod).
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.user,
  password: env.db.password,
  database: env.db.name,
  ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: env.isProd ? ['error'] : ['error', 'warn'],
  entities,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'schema_migrations',
});
