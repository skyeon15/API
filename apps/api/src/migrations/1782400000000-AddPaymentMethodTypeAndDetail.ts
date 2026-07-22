import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodTypeAndDetail1782400000000
  implements MigrationInterface
{
  name = 'AddPaymentMethodTypeAndDetail1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payment_methods: Stripe 결제수단 종류(card/naver_pay/kakao_pay 등)
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "pmType" character varying`,
    );
    // 수단별 상세(네이버페이 buyer_id/funding, 카드 exp/funding, 반복청구 mandate 등)
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "pmDetail" jsonb`,
    );
    // 기존 Stripe 행 중 last4가 남아있는 것만 card로 백필.
    // (네이버페이 등은 cardNo가 '****'라 제외 — 이후 조회 시 Stripe에서 채워진다)
    await queryRunner.query(
      `UPDATE "payment_methods" SET "pmType" = 'card'
       WHERE "provider" = 'stripe' AND "cardNo" ~ '^[0-9]{4}$'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "pmDetail"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "pmType"`,
    );
  }
}
