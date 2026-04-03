import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingTables1774594307454 implements MigrationInterface {
  name = 'AddMissingTables1774594307454';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "phone" character varying, "company" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'SEND', 'CANCEL')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_resource_enum" AS ENUM('channel', 'template', 'message')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "apiKeyId" uuid, "userId" uuid, "action" "public"."audit_logs_action_enum" NOT NULL, "resource" "public"."audit_logs_resource_enum" NOT NULL, "resourceId" character varying NOT NULL, "before" jsonb, "after" jsonb, "ip" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "alimtalk_channels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "senderKey" character varying NOT NULL, "plusId" character varying NOT NULL, "name" character varying NOT NULL, "categoryCode" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_256dd97f6ab82ea72d0cffe84c0" UNIQUE ("senderKey"), CONSTRAINT "PK_086dad37efb78e0a1021723afaf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alimtalk_templates_type_enum" AS ENUM('기본형', '강조표기형', '이미지형')`,
    );
    await queryRunner.query(
      `CREATE TABLE "alimtalk_templates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "code" character varying NOT NULL, "name" character varying NOT NULL, "channelId" uuid NOT NULL, "type" "public"."alimtalk_templates_type_enum" NOT NULL DEFAULT '기본형', "title" character varying, "subtitle" character varying, "content" text NOT NULL, "buttons" jsonb, "inspStatus" character varying NOT NULL DEFAULT 'REG', "isRemoved" boolean NOT NULL DEFAULT false, "createdByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b86506da95cd10dcea04aa9f67b" UNIQUE ("code"), CONSTRAINT "PK_c9be92679390d1b2137e24872b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alimtalk_messages_type_enum" AS ENUM('즉시', '예약', '취소')`,
    );
    await queryRunner.query(
      `CREATE TABLE "alimtalk_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "aligoMsgId" character varying, "channelId" uuid NOT NULL, "templateCode" character varying NOT NULL, "receiverPhone" character varying NOT NULL, "content" text NOT NULL, "title" character varying, "subtitle" character varying, "buttons" jsonb, "type" "public"."alimtalk_messages_type_enum" NOT NULL DEFAULT '즉시', "scheduledAt" TIMESTAMP, "sentAt" TIMESTAMP, "apiResponse" character varying, "resultCode" character varying, "resultMessage" character varying, "resultCheckedAt" TIMESTAMP, "isCompleted" boolean NOT NULL DEFAULT false, "isRemoved" boolean NOT NULL DEFAULT false, "sentByUserId" uuid, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a2ada0f02410660d9dc160cd8c1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`ALTER TABLE "api_keys" ADD "userId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "api_keys" ADD CONSTRAINT "FK_6c2e267ae764a9413b863a29342" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_741fa976d1e04e695f3aa23cb89" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_cfa83f61e4d27a87fcae1e025ab" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_channels" ADD CONSTRAINT "FK_9fc52739c3f5a8cb5bd05e98833" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_templates" ADD CONSTRAINT "FK_3f722738174740f1556b38412a6" FOREIGN KEY ("channelId") REFERENCES "alimtalk_channels"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_templates" ADD CONSTRAINT "FK_838902d854c53ef487a231b612a" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" ADD CONSTRAINT "FK_86da7ac77785fea3039446f66ca" FOREIGN KEY ("channelId") REFERENCES "alimtalk_channels"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" ADD CONSTRAINT "FK_ab53af14a1c24270401458eff4e" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" DROP CONSTRAINT "FK_ab53af14a1c24270401458eff4e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_messages" DROP CONSTRAINT "FK_86da7ac77785fea3039446f66ca"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_templates" DROP CONSTRAINT "FK_838902d854c53ef487a231b612a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_templates" DROP CONSTRAINT "FK_3f722738174740f1556b38412a6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "alimtalk_channels" DROP CONSTRAINT "FK_9fc52739c3f5a8cb5bd05e98833"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_cfa83f61e4d27a87fcae1e025ab"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_741fa976d1e04e695f3aa23cb89"`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_keys" DROP CONSTRAINT "FK_6c2e267ae764a9413b863a29342"`,
    );
    await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN "userId"`);
    await queryRunner.query(`DROP TABLE "alimtalk_messages"`);
    await queryRunner.query(`DROP TYPE "public"."alimtalk_messages_type_enum"`);
    await queryRunner.query(`DROP TABLE "alimtalk_templates"`);
    await queryRunner.query(
      `DROP TYPE "public"."alimtalk_templates_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "alimtalk_channels"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_resource_enum"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
