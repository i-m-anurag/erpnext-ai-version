import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Activity backbone: a generic timeline + comments store keyed by
 * (entity_type, record_id), plus the `state` column on master_data and
 * `workflow_slug` on master_registry that the workflow engine will use.
 */
export class ActivityAndState1780600000000 implements MigrationInterface {
  name = 'ActivityAndState1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "timeline_entries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "entity_type" character varying(64) NOT NULL,
        "record_id" character varying(128) NOT NULL,
        "kind" character varying(24) NOT NULL,
        "summary" character varying(512) NOT NULL,
        "data" jsonb,
        "actor_user_id" uuid,
        CONSTRAINT "PK_timeline_entries" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_timeline_record" ON "timeline_entries" ("entity_type", "record_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "entity_type" character varying(64) NOT NULL,
        "record_id" character varying(128) NOT NULL,
        "body" text NOT NULL,
        "author_user_id" uuid NOT NULL,
        CONSTRAINT "PK_comments" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_comments_record" ON "comments" ("entity_type", "record_id")`);

    await queryRunner.query(`ALTER TABLE "master_data" ADD "state" character varying(48)`);
    await queryRunner.query(`ALTER TABLE "master_registry" ADD "workflow_slug" character varying(128)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "master_registry" DROP COLUMN "workflow_slug"`);
    await queryRunner.query(`ALTER TABLE "master_data" DROP COLUMN "state"`);
    await queryRunner.query(`DROP INDEX "public"."idx_comments_record"`);
    await queryRunner.query(`DROP TABLE "comments"`);
    await queryRunner.query(`DROP INDEX "public"."idx_timeline_record"`);
    await queryRunner.query(`DROP TABLE "timeline_entries"`);
  }
}
