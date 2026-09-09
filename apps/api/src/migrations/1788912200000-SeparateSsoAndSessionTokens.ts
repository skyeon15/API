import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateSsoAndSessionTokens1788912200000
  implements MigrationInterface
{
  name = 'SeparateSsoAndSessionTokens1788912200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // SSO 토큰 교환으로 발급된 리프레시 토큰을 세션용과 구분한다.
    // 구분이 없으면 연동 서비스가 받은 리프레시 토큰을 쿠키에 실어
    // `POST /auth/refresh` 로 브라우저 세션 액세스 토큰을 받아낼 수 있다.
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "clientId" character varying`,
    );

    // 기존 행은 어느 쪽인지 알 수 없다. 남겨 두면 SSO 것이 세션으로 통과하므로
    // 전부 지운다 — 재로그인만 하면 되고, 그 편이 안전하다.
    await queryRunner.query(`DELETE FROM "refresh_tokens"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "clientId"`,
    );
  }
}
