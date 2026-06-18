import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodSeller1782000000000
  implements MigrationInterface
{
  name = 'AddPaymentMethodSeller1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payment_methods: 빌링키가 귀속된 판매자(payapp_sellers) 연결. Stripe row 대비 nullable
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "sellerId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD CONSTRAINT "FK_payment_methods_seller" FOREIGN KEY ("sellerId") REFERENCES "payapp_sellers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP CONSTRAINT "FK_payment_methods_seller"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "sellerId"`,
    );
  }
}
