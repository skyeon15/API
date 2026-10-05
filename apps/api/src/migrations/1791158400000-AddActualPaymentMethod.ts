import type { MigrationInterface, QueryRunner } from 'typeorm';
import { recordedPaymentMetadata } from '../users/payment-metadata.js';

export class AddActualPaymentMethod1791158400000 implements MigrationInterface {
  name = 'AddActualPaymentMethod1791158400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" ADD COLUMN IF NOT EXISTS "actualPaymentMethod" jsonb`,
    );
    // Bound memory use and update only display metadata, including payments later cancelled.
    let after: string | null = null;
    for (;;) {
      const rows = await queryRunner.query(
        `
        SELECT "id", "provider", "paidAt", "payMethod", "mulNo", "stripePaymentIntentId", "amount", "currency", "rawResponse"
        FROM "payment_transactions"
        WHERE "actualPaymentMethod" IS NULL AND "paidAt" IS NOT NULL AND ($1::uuid IS NULL OR "id" > $1::uuid)
        ORDER BY "id" LIMIT 500
      `,
        [after],
      );
      if (!rows.length) break;
      for (const row of rows) {
        const metadata = recordedPaymentMetadata(row);
        if (metadata) {
          await queryRunner.query(
            `UPDATE "payment_transactions" SET "actualPaymentMethod" = $2::jsonb
            WHERE "id" = $1 AND "actualPaymentMethod" IS NULL`,
            [row.id, JSON.stringify(metadata)],
          );
        }
      }
      after = rows[rows.length - 1].id;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_transactions" DROP COLUMN "actualPaymentMethod"`,
    );
  }
}
