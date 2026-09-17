import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 플랫폼 → 연동 서비스 콜백 웹훅.
 *
 * 그전까지 서비스는 «결제가 끝났는지» 를 `GET /profile/payments/transactions` 로 캐물어야만
 * 알 수 있었다(CLAUDE.md 의 «미구현(계획): 결제 완료 시 플랫폼→서비스 콜백 웹훅»).
 * 조회로 때우면 서비스마다 폴링 루프를 따로 짜게 되고, 그 루프가 언제 멈춰도 결제는
 * 성공했는데 서비스에는 아무 일도 안 일어난 상태가 된다.
 *
 * 구독 단위는 **서비스(=API 키 소유자)** 다. 키를 새로 발급해도 구독이 따라 죽지 않게
 * `api_keys` 가 아니라 별도 표에 둔다.
 */
export class AddServiceWebhooks1788912700000 implements MigrationInterface {
  name = 'AddServiceWebhooks1788912700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_webhooks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "url" character varying NOT NULL,
        "secret" character varying NOT NULL,
        "events" text array NOT NULL DEFAULT '{}',
        "isActive" boolean NOT NULL DEFAULT true,
        "lastStatus" integer,
        "lastError" character varying,
        "lastDeliveredAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_webhooks" PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_webhooks_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_service_webhooks_userId" ON "service_webhooks" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_service_webhooks_userId"`);
    await queryRunner.query(`DROP TABLE "service_webhooks"`);
  }
}
