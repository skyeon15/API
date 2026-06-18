import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeSupport1779840000000 implements MigrationInterface {
  name = 'AddStripeSupport1779840000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payment_transactions: provider 디스크리미네이터 + Stripe 멀티통화/식별자, 셀러 nullable화
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ALTER COLUMN "sellerId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "provider" character varying NOT NULL DEFAULT 'payapp'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "stripePaymentIntentId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "currency" character varying NOT NULL DEFAULT 'krw'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_transactions_stripePaymentIntentId" ON "payment_transactions" ("stripePaymentIntentId")`,
    );

    // payment_methods: provider + Stripe Customer, PG 셀러 컬럼 nullable화
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "provider" character varying NOT NULL DEFAULT 'payapp'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "customerId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ALTER COLUMN "merchantId" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ALTER COLUMN "merchantId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "customerId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "provider"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_transactions_stripePaymentIntentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "stripePaymentIntentId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "provider"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ALTER COLUMN "sellerId" SET NOT NULL`,
    );
  }
}
