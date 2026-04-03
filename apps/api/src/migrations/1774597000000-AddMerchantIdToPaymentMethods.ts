import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMerchantIdToPaymentMethods1774597000000 implements MigrationInterface {
  name = 'AddMerchantIdToPaymentMethods1774597000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "merchantId" character varying NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ALTER COLUMN "merchantId" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "merchantId"`,
    );
  }
}
