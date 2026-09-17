import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodUsages1788912500000 implements MigrationInterface {
  name = 'AddPaymentMethodUsages1788912500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payment_method_usages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "paymentMethodId" uuid NOT NULL,
        "clientId" varchar NOT NULL,
        "label" varchar NOT NULL,
        "externalId" varchar NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_method_usages_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_method_usages_payment_method" FOREIGN KEY ("paymentMethodId")
          REFERENCES "payment_methods"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_method_usages_paymentMethodId"
        ON "payment_method_usages" ("paymentMethodId");
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payment_method_usages_clientId"
        ON "payment_method_usages" ("clientId");
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payment_method_usages_method_client_ext"
        ON "payment_method_usages" ("paymentMethodId", "clientId", COALESCE("externalId", ''));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_method_usages"`);
  }
}
