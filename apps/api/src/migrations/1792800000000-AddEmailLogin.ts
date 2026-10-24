import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailLogin1792800000000 implements MigrationInterface {
  name = 'AddEmailLogin1792800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing contact emails are deliberately not promoted to login credentials.
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "loginEmail" varchar(254)`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_loginEmail" UNIQUE ("loginEmail")`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "CK_users_loginEmail_normalized" CHECK ("loginEmail" = lower(btrim("loginEmail")))`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN "sessionExpiresAt" timestamptz`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "sessionExpiresAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "loginEmail"`);
  }
}
