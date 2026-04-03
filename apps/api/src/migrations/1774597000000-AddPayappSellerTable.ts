import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayappSellerTable1774597000000 implements MigrationInterface {
  name = 'AddPayappSellerTable1774597000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "payapp_sellers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "sellerId" character varying NOT NULL, "linkKey" character varying NOT NULL, "linkVal" character varying NOT NULL, "memo" text, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_payapp_sellers_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "payapp_sellers" ADD CONSTRAINT "FK_payapp_sellers_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payapp_sellers" DROP CONSTRAINT "FK_payapp_sellers_userId"`,
    );
    await queryRunner.query(`DROP TABLE "payapp_sellers"`);
  }
}
