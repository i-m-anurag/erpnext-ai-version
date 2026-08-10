import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enrich the `assignments` table so it records the CONTEXT of each assignment,
 * giving a full audit trail across the roles/states a record passes through:
 *  - role                 which role the task was assigned as
 *  - state                the workflow state the assignment belongs to
 *  - assigned_by_user_id  who/what created it (null = the workflow engine)
 *  - closed_at            when the step finished (assignments are closed, never deleted)
 *  - due_at               optional SLA date for overdue reporting later
 *
 * `created_at` already exists (BaseEntity `createdAt`). Additive + idempotent.
 */
export class EnrichAssignments1782900000000 implements MigrationInterface {
  name = 'EnrichAssignments1782900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "role" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "state" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "assigned_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN IF EXISTS "due_at"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN IF EXISTS "closed_at"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN IF EXISTS "assigned_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN IF EXISTS "state"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN IF EXISTS "role"`);
  }
}
