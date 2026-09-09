import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOauthClientAdmins1788912300000 implements MigrationInterface {
  name = 'AddOauthClientAdmins1788912300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 서비스(SSO 클라이언트)별 관리자. 플랫폼 전체 ADMIN(users.roles)과는 별개다.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "oauth_client_admins" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clientId" character varying NOT NULL,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_oauth_client_admins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_oauth_client_admins_client_user" UNIQUE ("clientId", "userId"),
        CONSTRAINT "FK_oauth_client_admins_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_oauth_client_admins_client" FOREIGN KEY ("clientId")
          REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE
      )
    `);
    // userinfo 가 요청마다 «이 사용자가 이 서비스의 관리자인가»를 묻는다.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_oauth_client_admins_client" ON "oauth_client_admins" ("clientId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_client_admins"`);
  }
}
