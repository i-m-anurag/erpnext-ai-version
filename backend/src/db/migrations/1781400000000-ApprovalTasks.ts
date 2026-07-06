import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Serial approval sub-engine. Assignments double as approval TASKS (step_no +
 * outcome); the workflow instance carries the active approval chain state.
 */
export class ApprovalTasks1781400000000 implements MigrationInterface {
  name = 'ApprovalTasks1781400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // an assignment created by an approval chain records its step + final outcome
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "step_no" integer`);
    await queryRunner.query(`ALTER TABLE "assignments" ADD COLUMN "outcome" character varying(16)`);
    // the active approval chain for an instance (null when none in progress)
    await queryRunner.query(`ALTER TABLE "workflow_instances" ADD COLUMN "approval" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workflow_instances" DROP COLUMN "approval"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "outcome"`);
    await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "step_no"`);
  }
}
