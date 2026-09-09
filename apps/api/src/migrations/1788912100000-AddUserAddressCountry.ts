import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAddressCountry1788912100000 implements MigrationInterface {
  name = 'AddUserAddressCountry1788912100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 해외 주소는 «도로명주소 + 상세»만으로 성립하지 않는다. 도시·주(state)·국가가 있어야
    // 배송·세금 계산이 되고, OIDC 표준 address 클레임(locality/region/country)도 채울 수 있다.
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "addressCountry" character varying(2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "addressCity" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "addressState" character varying`,
    );

    // 지금까지 주소는 다음 우편번호(국내 전용)로만 입력됐다. 기존 행은 전부 국내 주소다.
    await queryRunner.query(
      `UPDATE "users" SET "addressCountry" = 'KR' WHERE "address" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "addressState"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "addressCity"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "addressCountry"`,
    );
  }
}
