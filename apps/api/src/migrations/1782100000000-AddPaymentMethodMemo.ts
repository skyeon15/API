import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodMemo1782100000000 implements MigrationInterface {
  name = 'AddPaymentMethodMemo1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // payment_methods: 내부 관리용 메모 컬럼
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "memo" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP COLUMN "memo"`,
    );
  }
}
