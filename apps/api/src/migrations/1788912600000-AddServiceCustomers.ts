import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 연동 서비스의 **최종 사용자**를 Stripe Customer 로 갈라 둔다.
 *
 * 그전까지 서비스가 API 키로 카드를 저장하면 그 카드가 전부 «키 소유자 한 명»의
 * Customer 에 붙었다 — CLAUDE.md 가 «금지 패턴»으로 못박고 "최종 사용자 빌링이
 * 필요해지면 externalUserId 단위 Customer 분리를 먼저 구현할 것"이라 적어 둔 그것이다.
 * 여기가 그 분리다.
 *
 * 정산 귀속은 바뀌지 않는다 — `payment_transactions.userId` 는 여전히 서비스(키 소유자)다.
 * 새 칸은 «그 서비스의 누구인가»를 가리킬 뿐이다.
 */
export class AddServiceCustomers1788912600000 implements MigrationInterface {
  name = 'AddServiceCustomers1788912600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "serviceUserId" uuid NOT NULL,
        "externalUserId" character varying NOT NULL,
        "stripeCustomerId" character varying NOT NULL,
        "label" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_customers" PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_customers_user"
          FOREIGN KEY ("serviceUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    // 한 서비스 안에서 externalUserId 는 유일하다 — 같은 사람에게 Customer 가 둘 생기면
    // 저장한 카드가 다음 청구에서 안 보인다.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_service_customers_service_external" ON "service_customers" ("serviceUserId", "externalUserId")`,
    );

    // 최종 사용자의 카드에는 플랫폼 계정이 없다 — userId 를 비울 수 있어야 한다.
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ALTER COLUMN "userId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD "serviceCustomerId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ADD CONSTRAINT "FK_payment_methods_service_customer"
        FOREIGN KEY ("serviceCustomerId") REFERENCES "service_customers"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_methods_serviceCustomerId" ON "payment_methods" ("serviceCustomerId")`,
    );

    // 거래에도 «그 서비스의 누구» 를 남긴다. userId(=서비스)는 그대로 둔다.
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "serviceCustomerId" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD "externalUserId" character varying`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_transactions_externalUserId" ON "payment_transactions" ("externalUserId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payment_transactions_externalUserId"`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP COLUMN "externalUserId"`);
    await queryRunner.query(`ALTER TABLE "payment_transactions" DROP COLUMN "serviceCustomerId"`);
    await queryRunner.query(`DROP INDEX "IDX_payment_methods_serviceCustomerId"`);
    await queryRunner.query(
      `ALTER TABLE "payment_methods" DROP CONSTRAINT "FK_payment_methods_service_customer"`,
    );
    await queryRunner.query(`ALTER TABLE "payment_methods" DROP COLUMN "serviceCustomerId"`);
    // userId NOT NULL 복원은 최종 사용자 카드가 남아 있으면 실패한다 — 먼저 지운다.
    await queryRunner.query(`DELETE FROM "payment_methods" WHERE "userId" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "payment_methods" ALTER COLUMN "userId" SET NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX "UQ_service_customers_service_external"`);
    await queryRunner.query(`DROP TABLE "service_customers"`);
  }
}
