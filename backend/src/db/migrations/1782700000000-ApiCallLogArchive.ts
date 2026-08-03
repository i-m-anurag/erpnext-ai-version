import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * api_call_log_archive — cold storage for old audit-log rows. The worker
 * periodically moves entries older than the configured retention window out of
 * the live api_call_log table into here, so the Admin viewer stays fast and
 * clean while history is preserved. Same columns as api_call_log plus
 * `archived_at`; no indexes (it's rarely queried).
 */
export class ApiCallLogArchive1782700000000 implements MigrationInterface {
  name = 'ApiCallLogArchive1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "api_call_log_archive" (LIKE "api_call_log" INCLUDING DEFAULTS)`);
    await queryRunner.query(`ALTER TABLE "api_call_log_archive" ADD COLUMN "archived_at" timestamptz NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "api_call_log_archive" ADD CONSTRAINT "PK_api_call_log_archive" PRIMARY KEY ("id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_call_log_archive"`);
  }
}
