import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOauthClientPayappSeller1788912400000
  implements MigrationInterface
{
  name = 'AddOauthClientPayappSeller1788912400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 서비스(SSO 클라이언트)의 수납 판매자 계정.
    // 최종 사용자의 빌링키는 «그 서비스의 판매자»로 발급돼야 서비스가 자기 이름으로 청구할 수 있다.
    // 지금까지는 판매자 계정을 «소유한 사람»의 카드만 등록할 수 있어서(payment.service.registerCard)
    // 고객 카드를 우리 판매자에 다는 길이 없었다.
    await queryRunner.query(`
      ALTER TABLE "oauth_clients"
        ADD COLUMN IF NOT EXISTS "payappSellerId" uuid NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_oauth_clients_payapp_seller'
        ) THEN
          ALTER TABLE "oauth_clients"
            ADD CONSTRAINT "FK_oauth_clients_payapp_seller"
            FOREIGN KEY ("payappSellerId") REFERENCES "payapp_sellers"("id")
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "oauth_clients" DROP CONSTRAINT IF EXISTS "FK_oauth_clients_payapp_seller"`,
    );
    await queryRunner.query(
      `ALTER TABLE "oauth_clients" DROP COLUMN IF EXISTS "payappSellerId"`,
    );
  }
}
