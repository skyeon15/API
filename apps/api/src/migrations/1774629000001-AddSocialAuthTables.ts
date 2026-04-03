import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSocialAuthTables1774629000001 implements MigrationInterface {
  name = 'AddSocialAuthTables1774629000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Update users table with missing columns ---
    const table = await queryRunner.getTable('users');
    if (table) {
      const columnsToAdd: TableColumn[] = [];

      if (!table.findColumnByName('ci')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'ci',
            type: 'character varying',
            isNullable: true,
            isUnique: true,
          }),
        );
      }
      if (!table.findColumnByName('email')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'email',
            type: 'character varying',
            isNullable: true,
            isUnique: true,
          }),
        );
      }
      if (!table.findColumnByName('nickname')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'nickname',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('profileImageUrl')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'profileImageUrl',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('birthDate')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'birthDate',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('gender')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'gender',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('zipCode')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'zipCode',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('address')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'address',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('detailAddress')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'detailAddress',
            type: 'character varying',
            isNullable: true,
          }),
        );
      }
      if (!table.findColumnByName('metadata')) {
        columnsToAdd.push(
          new TableColumn({
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          }),
        );
      }

      if (columnsToAdd.length > 0) {
        await queryRunner.addColumns('users', columnsToAdd);
      }

      if (!table.findColumnByName('status')) {
        const hasStatusType = await queryRunner.query(
          `SELECT 1 FROM pg_type WHERE typname = 'users_status_enum'`,
        );
        if (hasStatusType.length === 0) {
          await queryRunner.query(
            `CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'BLOCKED', 'WITHDRAWN')`,
          );
        }
        await queryRunner.addColumn(
          'users',
          new TableColumn({
            name: 'status',
            type: 'enum',
            enum: ['ACTIVE', 'BLOCKED', 'WITHDRAWN'],
            default: "'ACTIVE'",
          }),
        );
      }
    }

    // --- Update alimtalk_messages with missing columns ---
    const messageTable = await queryRunner.getTable('alimtalk_messages');
    if (messageTable && !messageTable.findColumnByName('transactionId')) {
      await queryRunner.addColumn(
        'alimtalk_messages',
        new TableColumn({
          name: 'transactionId',
          type: 'character varying',
          isNullable: true,
          isUnique: true,
        }),
      );
    }

    // --- Social Accounts ---
    const hasSocialType = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'user_social_accounts_provider_enum'`,
    );
    if (hasSocialType.length === 0) {
      await queryRunner.query(
        `CREATE TYPE "public"."user_social_accounts_provider_enum" AS ENUM('kakao', 'naver', 'google', 'apple', 'phone')`,
      );
    }

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_social_accounts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "provider" "public"."user_social_accounts_provider_enum" NOT NULL, "providerUserId" character varying NOT NULL, "rawProfile" jsonb, "syncedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_user_social_accounts_id" PRIMARY KEY ("id"))`,
    );

    const hasSocialIndex = await queryRunner.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_user_social_accounts_provider_providerUserId'`,
    );
    if (hasSocialIndex.length === 0) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_user_social_accounts_provider_providerUserId" ON "user_social_accounts" ("provider", "providerUserId")`,
      );
    }

    const socialTable = await queryRunner.getTable('user_social_accounts');
    if (socialTable && socialTable.foreignKeys.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "user_social_accounts" ADD CONSTRAINT "FK_user_social_accounts_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }

    // --- OAuth Clients ---
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "oauth_clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" character varying NOT NULL, "clientSecret" character varying NOT NULL, "clientName" character varying NOT NULL, "redirectUris" text NOT NULL, "logoUrl" character varying, "primaryColor" character varying NOT NULL DEFAULT '#000000', "themeConfig" jsonb, "allowedScopes" text NOT NULL DEFAULT 'openid,profile', "requiredScopes" text NOT NULL DEFAULT 'openid,profile', "autoGrant" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_oauth_clients_clientId" UNIQUE ("clientId"), CONSTRAINT "PK_oauth_clients_id" PRIMARY KEY ("id"))`,
    );

    // --- OAuth Grants ---
    const hasGrantType = await queryRunner.query(
      `SELECT 1 FROM pg_type WHERE typname = 'oauth_grants_status_enum'`,
    );
    if (hasGrantType.length === 0) {
      await queryRunner.query(
        `CREATE TYPE "public"."oauth_grants_status_enum" AS ENUM('ACTIVE', 'REVOKED')`,
      );
    }

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "oauth_grants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "clientId" character varying NOT NULL, "grantedScopes" text NOT NULL, "status" "public"."oauth_grants_status_enum" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_oauth_grants_id" PRIMARY KEY ("id"))`,
    );

    const hasGrantIndex = await queryRunner.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_oauth_grants_userId_clientId'`,
    );
    if (hasGrantIndex.length === 0) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX "IDX_oauth_grants_userId_clientId" ON "oauth_grants" ("userId", "clientId")`,
      );
    }

    const grantTable = await queryRunner.getTable('oauth_grants');
    if (grantTable && grantTable.foreignKeys.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "oauth_grants" ADD CONSTRAINT "FK_oauth_grants_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
      await queryRunner.query(
        `ALTER TABLE "oauth_grants" ADD CONSTRAINT "FK_oauth_grants_clientId" FOREIGN KEY ("clientId") REFERENCES "oauth_clients"("clientId") ON DELETE CASCADE ON UPDATE NO ACTION`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
