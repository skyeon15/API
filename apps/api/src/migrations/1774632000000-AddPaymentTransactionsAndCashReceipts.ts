import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentTransactionsAndCashReceipts1774632000000
  implements MigrationInterface
{
  name = 'AddPaymentTransactionsAndCashReceipts1774632000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."payment_transactions_status_enum" AS ENUM('pending', 'paid', 'partial_cancelled', 'cancelled', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payment_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "paymentMethodId" uuid,
        "sellerId" uuid NOT NULL,
        "orderId" character varying NOT NULL,
        "mulNo" character varying,
        "goodName" character varying NOT NULL,
        "amount" integer NOT NULL,
        "cancelledAmount" integer NOT NULL DEFAULT 0,
        "buyerName" character varying,
        "buyerPhone" character varying,
        "payMethod" character varying NOT NULL DEFAULT 'billing',
        "status" "public"."payment_transactions_status_enum" NOT NULL DEFAULT 'pending',
        "rawResponse" jsonb,
        "paidAt" TIMESTAMP,
        "cancelledAt" TIMESTAMP,
        "memo" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_transactions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payment_transactions_orderId" UNIQUE ("orderId")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_transactions_userId" ON "payment_transactions" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_payment_transactions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_payment_transactions_paymentMethodId" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD CONSTRAINT "FK_payment_transactions_sellerId" FOREIGN KEY ("sellerId") REFERENCES "payapp_sellers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."cash_receipts_type_enum" AS ENUM('소득공제', '지출증빙')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."cash_receipts_status_enum" AS ENUM('request', 'issued', 'cancelled', 'failed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "cash_receipts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "transactionId" uuid,
        "sellerId" uuid NOT NULL,
        "type" "public"."cash_receipts_type_enum" NOT NULL,
        "buyerName" character varying NOT NULL,
        "idInfo" character varying NOT NULL,
        "goodName" character varying NOT NULL,
        "amount" integer NOT NULL,
        "supplyAmount" integer NOT NULL,
        "taxAmount" integer NOT NULL,
        "cashstno" character varying,
        "cashsturl" text,
        "status" "public"."cash_receipts_status_enum" NOT NULL DEFAULT 'request',
        "rawResponse" jsonb,
        "issuedAt" TIMESTAMP,
        "cancelledAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_receipts_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cash_receipts_userId" ON "cash_receipts" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_receipts" ADD CONSTRAINT "FK_cash_receipts_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_receipts" ADD CONSTRAINT "FK_cash_receipts_transactionId" FOREIGN KEY ("transactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_receipts" ADD CONSTRAINT "FK_cash_receipts_sellerId" FOREIGN KEY ("sellerId") REFERENCES "payapp_sellers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cash_receipts" DROP CONSTRAINT "FK_cash_receipts_sellerId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_receipts" DROP CONSTRAINT "FK_cash_receipts_transactionId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cash_receipts" DROP CONSTRAINT "FK_cash_receipts_userId"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_cash_receipts_userId"`);
    await queryRunner.query(`DROP TABLE "cash_receipts"`);
    await queryRunner.query(`DROP TYPE "public"."cash_receipts_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."cash_receipts_type_enum"`);

    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_payment_transactions_sellerId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_payment_transactions_paymentMethodId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP CONSTRAINT "FK_payment_transactions_userId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_payment_transactions_userId"`,
    );
    await queryRunner.query(`DROP TABLE "payment_transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."payment_transactions_status_enum"`,
    );
  }
}
