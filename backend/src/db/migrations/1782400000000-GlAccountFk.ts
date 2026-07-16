import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enforce referential integrity between the ledger and the Chart of Accounts: every
 * gl_entry.account must reference a real account.code. Without it, a posting to an
 * unknown code was accepted and then silently dropped by the INNER-JOIN reports,
 * unbalancing the books. (account.code carries uq_account_code, so it is a valid FK
 * target.)
 */
export class GlAccountFk1782400000000 implements MigrationInterface {
  name = 'GlAccountFk1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "gl_entry"
        ADD CONSTRAINT "fk_gl_entry_account"
        FOREIGN KEY ("account") REFERENCES "account" ("code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "gl_entry" DROP CONSTRAINT "fk_gl_entry_account"`);
  }
}
