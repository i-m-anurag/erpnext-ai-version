import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ConfigResources1780385487976 implements MigrationInterface {
    name = 'ConfigResources1780385487976'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "config_resources" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "resource_type" character varying(64) NOT NULL, "slug" character varying(128) NOT NULL, "scope" character varying(16) NOT NULL, "version" integer NOT NULL DEFAULT '1', "definition" jsonb NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'active', CONSTRAINT "uq_config_resource" UNIQUE ("resource_type", "slug", "scope"), CONSTRAINT "PK_23090c601a6b72b97f34f04b711" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "idx_config_resource_lookup" ON "config_resources"  ("resource_type", "slug") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_config_resource_lookup"`);
        await queryRunner.query(`DROP TABLE "config_resources"`);
    }

}
