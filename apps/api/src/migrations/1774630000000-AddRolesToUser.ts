import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRolesToUser1774630000000 implements MigrationInterface {
  name = 'AddRolesToUser1774630000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (table && !table.findColumnByName('roles')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'roles',
          type: 'text',
          isArray: true,
          default: "'{USER}'",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (table && table.findColumnByName('roles')) {
      await queryRunner.dropColumn('users', 'roles');
    }
  }
}
