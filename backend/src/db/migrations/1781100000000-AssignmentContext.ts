import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enrich the assignments table so each row records the CONTEXT of the assignment
 * — which role it was for, which workflow state/step it belongs to, who assigned
 * it, and when it was closed. This turns the table into a full audit trail of a
 * transaction moving across roles/steps (assignments are closed, never deleted).
 */
export class AssignmentContext1781100000000 implements MigrationInterface {
  name = 'AssignmentContext1781100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "role" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "state" character varying(64)`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "assigned_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "closed_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "closed_at"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "assigned_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "state"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "role"`);
  }
}
