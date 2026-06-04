import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline migration: enable the Postgres extensions the schema relies on.
 * uuid-ossp provides uuid_generate_v4() (TypeORM's default for uuid primary
 * keys); pgcrypto provides gen_random_uuid() and crypto helpers. Module tables
 * are added by subsequent generated migrations.
 */
export class InitExtensions1717400000000 implements MigrationInterface {
  name = 'InitExtensions1717400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP EXTENSION IF EXISTS "pgcrypto"');
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
}
