import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Home branch/location on a user — drives location-based approval routing. */
export class UserBranch1781200000000 implements MigrationInterface {
  name = 'UserBranch1781200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "branch" character varying(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "branch"`);
  }
}
