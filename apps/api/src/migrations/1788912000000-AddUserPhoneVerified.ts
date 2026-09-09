import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPhoneVerified1788912000000 implements MigrationInterface {
  name = 'AddUserPhoneVerified1788912000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phoneVerified" boolean NOT NULL DEFAULT false`,
    );

    // 지금까지 users.phone 이 채워지는 경로는 문자 인증(verifyPhone)과
    // 카카오·네이버(본인확인이 끝난 번호) 뿐이었다. 기존 행은 전부 인증된 번호로 본다.
    // (해외 번호를 인증 없이 받기 시작하는 것은 이 마이그레이션 이후부터다.)
    await queryRunner.query(
      `UPDATE "users" SET "phoneVerified" = true WHERE "phone" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "phoneVerified"`,
    );
  }
}
