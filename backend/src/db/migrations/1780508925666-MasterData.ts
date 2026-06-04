import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MasterData1780508925666 implements MigrationInterface {
    name = 'MasterData1780508925666'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "master_data" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "master_slug" character varying(64) NOT NULL, "code" character varying(128) NOT NULL, "data" jsonb NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'active', CONSTRAINT "uq_master_data" UNIQUE ("master_slug", "code"), CONSTRAINT "PK_ed55f1736986cf68b330d92bfee" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_master_data_slug" ON "master_data"  ("master_slug") `);
        await queryRunner.query(`ALTER TABLE "master_registry" ADD "code_field" character varying(64) NOT NULL DEFAULT 'code'`);
        await queryRunner.query(`ALTER TABLE "master_registry" ADD "label_field" character varying(64) NOT NULL DEFAULT 'name'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "master_registry" DROP COLUMN "label_field"`);
        await queryRunner.query(`ALTER TABLE "master_registry" DROP COLUMN "code_field"`);
        await queryRunner.query(`DROP INDEX "public"."idx_master_data_slug"`);
        await queryRunner.query(`DROP TABLE "master_data"`);
    }

}
