import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeCustomerAndExternalOrderId1782300000000
  implements MigrationInterface
{
  name = 'AddStripeCustomerAndExternalOrderId1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // users: Stripe Customer 재사용용 (일회성 결제 시 중복 생성 방지)
    await queryRunner.query(
      `ALTER TABLE "users" ADD "stripeCustomerId" character varying`,
    );
    // payment_transactions: 호출 서비스측 주문번호 (대사용)
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "externalOrderId" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_transactions_externalOrderId" ON "payment_transactions" ("externalOrderId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_payment_transactions_externalOrderId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "externalOrderId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "stripeCustomerId"`,
    );
  }
}
