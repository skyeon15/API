import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameAligoMsgIdToProviderMessageId1774631000000 implements MigrationInterface {
  name = 'RenameAligoMsgIdToProviderMessageId1774631000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" RENAME COLUMN "aligoMsgId" TO "providerMessageId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" DROP CONSTRAINT IF EXISTS "UQ_alimtalk_messages_aligoMsgId"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" RENAME COLUMN "providerMessageId" TO "aligoMsgId"`,
    );
  }
}
