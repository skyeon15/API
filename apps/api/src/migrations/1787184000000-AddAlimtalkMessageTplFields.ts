import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlimtalkMessageTplFields1787184000000 implements MigrationInterface {
  name = 'AddAlimtalkMessageTplFields1787184000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 발송 시점의 템플릿 부가정보/광고문구 스냅샷.
    // 엔티티(AlimtalkMessage)에는 있었으나 alimtalk_messages 테이블에는 누락돼 INSERT가 실패했다.
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" ADD COLUMN IF NOT EXISTS "tplExtra" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" ADD COLUMN IF NOT EXISTS "tplAdvert" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" DROP COLUMN IF EXISTS "tplAdvert"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" DROP COLUMN IF EXISTS "tplExtra"`,
    );
  }
}
