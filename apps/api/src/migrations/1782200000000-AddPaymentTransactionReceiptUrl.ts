import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentTransactionReceiptUrl1782200000000
  implements MigrationInterface
{
  name = 'AddPaymentTransactionReceiptUrl1782200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payment_transactions: PG 영수증 URL 컬럼
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "receiptUrl" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "receiptUrl"`,
    );
  }
}
