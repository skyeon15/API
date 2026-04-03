import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminAuditResources1774595167211 implements MigrationInterface {
  name = 'AddAdminAuditResources1774595167211';
  transaction = false; // ADD VALUE cannot run inside a transaction in PostgreSQL

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_resource_enum" ADD VALUE IF NOT EXISTS 'user'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_resource_enum" ADD VALUE IF NOT EXISTS 'api_key'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "resource" TYPE varchar`,
    );
    await queryRunner.query(`DROP TYPE "public"."audit_logs_resource_enum"`);
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_resource_enum" AS ENUM('channel', 'template', 'message')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "resource" TYPE "public"."audit_logs_resource_enum" USING "resource"::"public"."audit_logs_resource_enum"`,
    );
  }
}
