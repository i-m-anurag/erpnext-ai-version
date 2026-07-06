import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Workflow v2 versioning + instance pinning. `workflow_versions` holds immutable
 * published snapshots of a workflow; `workflow_instances` pins each document to the
 * version it started on (so editing a workflow never changes in-flight documents).
 */
export class WorkflowVersioning1781300000000 implements MigrationInterface {
  name = 'WorkflowVersioning1781300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workflow_versions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "workflow_key" character varying(128) NOT NULL,
        "entity_type" character varying(64) NOT NULL,
        "version_no" integer NOT NULL,
        "status" character varying(16) NOT NULL DEFAULT 'published',
        "definition" jsonb NOT NULL,
        CONSTRAINT "PK_workflow_versions" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_wf_versions_key_status" ON "workflow_versions" ("workflow_key", "status")`,
    );

    await queryRunner.query(`
      CREATE TABLE "workflow_instances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "entity_type" character varying(64) NOT NULL,
        "record_id" character varying(128) NOT NULL,
        "workflow_version_id" uuid NOT NULL,
        "current_state" character varying(64),
        "status" character varying(16) NOT NULL DEFAULT 'active',
        "branch" character varying(64),
        CONSTRAINT "PK_workflow_instances" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wf_instances_version" FOREIGN KEY ("workflow_version_id")
          REFERENCES "workflow_versions"("id")
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_wf_instances_record" ON "workflow_instances" ("entity_type", "record_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_wf_instances_version" ON "workflow_instances" ("workflow_version_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "workflow_instances"`);
    await queryRunner.query(`DROP TABLE "workflow_versions"`);
  }
}
