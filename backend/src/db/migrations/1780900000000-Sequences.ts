import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Naming-series counters. One row per (series_key, period_key); incremented
 * atomically via INSERT … ON CONFLICT DO UPDATE … RETURNING, so concurrent
 * creates never collide. `period_key` lets a series reset per year/month.
 */
export class Sequences1780900000000 implements MigrationInterface {
  name = 'Sequences1780900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sequences" (
        "series_key" character varying(128) NOT NULL,
        "period_key" character varying(32) NOT NULL,
        "counter" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_sequences" PRIMARY KEY ("series_key", "period_key")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sequences"`);
  }
}
