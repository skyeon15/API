import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAlimtalkTemplateFields1774631000001 implements MigrationInterface {
    name = 'AddAlimtalkTemplateFields1774631000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "alimtalk_templates" ADD "tplType" varchar NOT NULL DEFAULT 'BA'`);
        await queryRunner.query(`ALTER TABLE "alimtalk_templates" ADD "tplAdvert" varchar`);
        await queryRunner.query(`ALTER TABLE "alimtalk_templates" ADD "tplExtra" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "alimtalk_templates" DROP COLUMN "tplExtra"`);
        await queryRunner.query(`ALTER TABLE "alimtalk_templates" DROP COLUMN "tplAdvert"`);
        await queryRunner.query(`ALTER TABLE "alimtalk_templates" DROP COLUMN "tplType"`);
    }

}
