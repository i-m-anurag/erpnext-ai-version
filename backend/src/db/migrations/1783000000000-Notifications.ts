import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Communication engine tables:
 *  - notification_log: delivery audit + idempotency for every channel.
 *  - notifications: the in-app feed (bell), one row per user per notice.
 */
export class Notifications1783000000000 implements MigrationInterface {
  name = 'Notifications1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "channel" character varying(16) NOT NULL,
        "template" character varying(128),
        "recipient" character varying(255) NOT NULL,
        "subject" character varying(255),
        "status" character varying(16) NOT NULL DEFAULT 'queued',
        "error" text,
        "entity_type" character varying(64),
        "record_id" character varying(128),
        "purpose" character varying(64),
        "dedupe_key" character varying(255),
        "sent_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_notification_log" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_notiflog_record" ON "notification_log" ("entity_type", "record_id")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_notiflog_dedupe" ON "notification_log" ("dedupe_key") WHERE "dedupe_key" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "user_id" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" character varying(500),
        "link" character varying(255),
        "read" boolean NOT NULL DEFAULT false,
        "entity_type" character varying(64),
        "record_id" character varying(128),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_notifications_user" ON "notifications" ("user_id", "read")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_notifications_user"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."uq_notiflog_dedupe"`);
    await queryRunner.query(`DROP INDEX "public"."idx_notiflog_record"`);
    await queryRunner.query(`DROP TABLE "notification_log"`);
  }
}
