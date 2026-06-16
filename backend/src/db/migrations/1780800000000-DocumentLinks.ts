import type { MigrationInterface, QueryRunner } from 'typeorm';

/** document_links — lineage edges between document records (master rows). */
export class DocumentLinks1780800000000 implements MigrationInterface {
  name = 'DocumentLinks1780800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "document_links" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "from_master" character varying(64) NOT NULL,
        "from_code" character varying(128) NOT NULL,
        "to_master" character varying(64) NOT NULL,
        "to_code" character varying(128) NOT NULL,
        "relation" character varying(64) NOT NULL,
        CONSTRAINT "PK_document_links" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX "idx_doclink_from" ON "document_links" ("from_master", "from_code")`);
    await queryRunner.query(`CREATE INDEX "idx_doclink_to" ON "document_links" ("to_master", "to_code")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."idx_doclink_to"`);
    await queryRunner.query(`DROP INDEX "public"."idx_doclink_from"`);
    await queryRunner.query(`DROP TABLE "document_links"`);
  }
}
