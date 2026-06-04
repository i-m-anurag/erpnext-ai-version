import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MasterRegistry1780398407797 implements MigrationInterface {
    name = 'MasterRegistry1780398407797'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "master_registry" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "slug" character varying(64) NOT NULL, "name" character varying(128) NOT NULL, "managed_by" character varying(16) NOT NULL, "editable" boolean NOT NULL DEFAULT true, "form_slug" character varying(128), "cache_ttl_seconds" integer NOT NULL DEFAULT '3600', "status" character varying(16) NOT NULL DEFAULT 'active', CONSTRAINT "chk_master_slug" CHECK (slug ~ '^[a-z][a-z0-9-]*$'), CONSTRAINT "PK_9cb000fdb6ab68744ca44b22d33" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_master_registry_slug" ON "master_registry"  ("slug") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."uq_master_registry_slug"`);
        await queryRunner.query(`DROP TABLE "master_registry"`);
    }

}
