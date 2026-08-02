import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * api_call_log — append-only audit trail of every outbound third-party API call
 * routed through the HTTP gateway (request, response/error, timing). Keeps a
 * durable record of what the ERP exchanged with external services (e.g. Collatio).
 */
export class ApiCallLog1782600000000 implements MigrationInterface {
  name = 'ApiCallLog1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_call_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "provider" character varying(64) NOT NULL,
        "operation" character varying(128) NOT NULL,
        "method" character varying(10) NOT NULL,
        "url" text NOT NULL,
        "req_content_type" character varying(128),
        "req_headers" jsonb,
        "req_body" text,
        "resp_status" integer,
        "resp_body" text,
        "ok" boolean NOT NULL DEFAULT false,
        "duration_ms" integer NOT NULL DEFAULT 0,
        "error_message" text,
        "mock" boolean NOT NULL DEFAULT false,
        "correlation_id" character varying(128),
        "entity_type" character varying(128),
        "entity_id" character varying(128),
        "actor_user_id" uuid,
        CONSTRAINT "PK_api_call_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_api_log_provider" ON "api_call_log" ("provider", "created_at")`);
    await queryRunner.query(`CREATE INDEX "idx_api_log_correlation" ON "api_call_log" ("correlation_id")`);
    await queryRunner.query(`CREATE INDEX "idx_api_log_entity" ON "api_call_log" ("entity_type", "entity_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_call_log"`);
  }
}
