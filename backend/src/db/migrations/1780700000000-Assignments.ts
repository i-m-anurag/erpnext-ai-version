import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Assignments table — records assigned to users by the workflow `assign` action. */
export class Assignments1780700000000 implements MigrationInterface {
  name = 'Assignments1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "entity_type" character varying(64) NOT NULL,
        "record_id" character varying(128) NOT NULL,
        "assignee_user_id" uuid NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'open',
        "rule_name" character varying(128),
        CONSTRAINT "PK_assignments" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_assignments_assignee" ON "assignments" ("assignee_user_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_assignments_record" ON "assignments" ("entity_type", "record_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_assignments_record"`);
    await queryRunner.query(`DROP INDEX "public"."idx_assignments_assignee"`);
    await queryRunner.query(`DROP TABLE "assignments"`);
  }
}
